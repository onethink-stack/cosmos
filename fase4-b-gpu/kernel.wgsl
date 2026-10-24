struct Entrada {
  cabecalho: vec4<u32>,
  clausulas: array<vec2<u32>, 34>,
}
@group(0) @binding(0) var<storage, read> dados: Entrada;
@group(0) @binding(1) var<storage, read_write> testemunhos: array<u32>;

@compute @workgroup_size(64)
fn calcular(@builtin(global_invocation_id) gid: vec3<u32>) {
  let a = gid.x;
  if (a >= 4096u) { return; }
  if (dados.cabecalho.x != 1u || dados.cabecalho.y != 12u ||
      dados.cabecalho.z != 34u || dados.cabecalho.w != 4096u) {
    testemunhos[a] = 0xfffffffeu;
    return;
  }
  for (var i = 0u; i < 34u; i = i + 1u) {
    let c = dados.clausulas[i];
    if (((a & c.x) == 0u) && (((~a) & c.y & 0xfffu) == 0u)) {
      testemunhos[a] = i;
      return;
    }
  }
  testemunhos[a] = 0xffffffffu;
}
