use std::{borrow::Cow, fs, future::Future, path::PathBuf, sync::{Arc, mpsc}, task::{Context, Poll, Wake, Waker}, thread, time::{Duration, Instant}};

struct Acordar(thread::Thread);
impl Wake for Acordar { fn wake(self: Arc<Self>) { self.0.unpark(); } }
fn esperar<F: Future>(future: F, inicio: Instant) -> Result<F::Output, String> {
    let waker = Waker::from(Arc::new(Acordar(thread::current())));
    let mut cx = Context::from_waker(&waker);
    let mut f = std::pin::pin!(future);
    loop {
        if inicio.elapsed() >= Duration::from_secs(20) { return Err("timeout-host".into()); }
        match f.as_mut().poll(&mut cx) {
            Poll::Ready(v) => return Ok(v),
            Poll::Pending => thread::park_timeout(Duration::from_millis(1)),
        }
    }
}
fn executar() -> Result<(), String> {
    let inicio = Instant::now();
    let args: Vec<_> = std::env::args_os().collect();
    if args.len() != 3 { return Err("uso: host ENTRADA_BIN DIRETORIO_NOVO".into()); }
    if cfg!(target_endian = "big") { return Err("host-nao-little-endian".into()); }
    let input = fs::read(&args[1]).map_err(|_| "entrada-indisponivel")?;
    if input.len() != 288 { return Err("entrada-tamanho-invalido".into()); }
    let palavra = |i: usize| u32::from_le_bytes(input[i..i+4].try_into().unwrap());
    if [palavra(0), palavra(4), palavra(8), palavra(12)] != [1, 12, 34, 4096] { return Err("cabecalho-invalido".into()); }
    for i in 0..34 {
        let p = palavra(16+i*8); let n = palavra(20+i*8);
        if (p | n) == 0 || (p | n) & !0xfff != 0 || p & n != 0 { return Err("mascara-invalida".into()); }
    }
    let destino = PathBuf::from(&args[2]);
    fs::create_dir(&destino).map_err(|_| "destino-deve-ser-novo")?;
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor { backends: wgpu::Backends::VULKAN, ..Default::default() });
    let adapter = esperar(instance.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::HighPerformance,
        force_fallback_adapter: false, compatible_surface: None,
    }), inicio)?.map_err(|_| "adaptador-vulkan-indisponivel")?;
    let info = adapter.get_info();
    if !matches!(info.device_type, wgpu::DeviceType::IntegratedGpu | wgpu::DeviceType::DiscreteGpu)
        || info.vendor != 0x1002 || !info.name.to_ascii_lowercase().contains("vega 8") {
        return Err(format!("adaptador-fisico-esperado-nao-encontrado: {:?} {:?}", info.name, info.device_type));
    }
    let limites = adapter.limits();
    if limites.max_compute_invocations_per_workgroup < 64 || limites.max_compute_workgroup_size_x < 64
        || limites.max_compute_workgroups_per_dimension < 64 || limites.max_storage_buffer_binding_size < 16384 {
        return Err("limites-dispositivo-insuficientes".into());
    }
    let (device, queue) = esperar(adapter.request_device(&wgpu::DeviceDescriptor {
        label: Some("COSMOS B GPU"), required_features: wgpu::Features::empty(),
        required_limits: wgpu::Limits::downlevel_defaults(), ..Default::default()
    }), inicio)?.map_err(|_| "device-indisponivel")?;
    let entrada = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("entrada-288"), size: 288, usage: wgpu::BufferUsages::STORAGE, mapped_at_creation: true });
    entrada.slice(..).get_mapped_range_mut().copy_from_slice(&input); entrada.unmap();
    let saida = device.create_buffer(&wgpu::BufferDescriptor { label: Some("saida-16384"), size: 16384,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let inicial: Vec<u8> = (0..4096).flat_map(|_| 0xfffffffeu32.to_le_bytes()).collect();
    queue.write_buffer(&saida, 0, &inicial);
    let leitura = device.create_buffer(&wgpu::BufferDescriptor { label: Some("readback"), size: 16384,
        usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("kernel-pinado"),
        source: wgpu::ShaderSource::Wgsl(Cow::Borrowed(include_str!("../kernel.wgsl"))) });
    let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor { label: Some("calcular"),
        layout: None, module: &shader, entry_point: Some("calcular"), compilation_options: Default::default(), cache: None });
    let grupo = device.create_bind_group(&wgpu::BindGroupDescriptor { label: Some("dados"), layout: &pipeline.get_bind_group_layout(0),
        entries: &[wgpu::BindGroupEntry { binding: 0, resource: entrada.as_entire_binding() },
            wgpu::BindGroupEntry { binding: 1, resource: saida.as_entire_binding() }] });
    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("dispatch-64x64") });
    {
        let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("GPU-real"), timestamp_writes: None });
        pass.set_pipeline(&pipeline); pass.set_bind_group(0, &grupo, &[]); pass.dispatch_workgroups(64, 1, 1);
    }
    encoder.copy_buffer_to_buffer(&saida, 0, &leitura, 0, 16384);
    queue.submit(Some(encoder.finish()));
    let (tx, rx) = mpsc::channel();
    leitura.slice(..).map_async(wgpu::MapMode::Read, move |r| { let _ = tx.send(r); });
    loop {
        if inicio.elapsed() >= Duration::from_secs(20) { return Err("timeout-readback".into()); }
        device.poll(wgpu::PollType::Poll).map_err(|_| "device-poll-falhou")?;
        match rx.try_recv() {
            Ok(r) => { r.map_err(|_| "map-readback-falhou")?; break; },
            Err(mpsc::TryRecvError::Empty) => thread::sleep(Duration::from_millis(1)),
            Err(_) => return Err("canal-readback-falhou".into()),
        }
    }
    let bytes = leitura.slice(..).get_mapped_range().to_vec(); leitura.unmap();
    if bytes.len() != 16384 { return Err("saida-tamanho-invalido".into()); }
    fs::write(destino.join("testemunhos.bin"), &bytes).map_err(|_| "escrita-saida-falhou")?;
    fs::write(destino.join("entrada.bin"), &input).map_err(|_| "escrita-entrada-falhou")?;
    fs::write(destino.join("kernel.wgsl"), include_bytes!("../kernel.wgsl")).map_err(|_| "escrita-kernel-falhou")?;
    let meta = serde_json::json!({ "formato":"cosmos-b-gpu-host-observacao-v1", "adapterName":info.name,
        "vendor":info.vendor, "device":info.device, "deviceType":format!("{:?}",info.device_type),
        "backend":format!("{:?}",info.backend), "driver":info.driver, "driverInfo":info.driver_info,
        "wgpuVersao":"30.0.1", "hostVersao":"0.1.0", "fallbackCpu":false,
        "dispatch":[64,1,1], "workgroupSize":64, "bytesReadback":bytes.len(),
        "duracaoMs":inicio.elapsed().as_millis(), "limiteMs":20000,
        "limiteDeEvidencia":"observacao operacional, nao atestacao criptografica do hardware" });
    fs::write(destino.join("host-metadata.json"), serde_json::to_vec_pretty(&meta).unwrap()).map_err(|_| "escrita-metadata-falhou")?;
    println!("GPU física {:?}, Vulkan, dispatch 64x64, {} bytes", info.device_type, bytes.len());
    Ok(())
}
fn main() {
    if let Err(e) = executar() { eprintln!("B GPU interrompido: {e}"); std::process::exit(2); }
}
