struct Entrada {
  cabecalho: array<u32, 4>,
  clausulas: array<vec2<u32>, 75>,
}
@group(0) @binding(0) var<storage, read> dados: Entrada;
@group(0) @binding(1) var<storage, read_write> testemunhos: array<u32>;

@compute @workgroup_size(64)
fn calcular(@builtin(global_invocation_id) gid: vec3<u32>) {
  let a = gid.x;
  if (a >= 1048576u) { return; }
  if (dados.cabecalho[0] != 1u || dados.cabecalho[1] != 20u ||
      dados.cabecalho[2] != 75u || dados.cabecalho[3] != 1048576u) {
    testemunhos[a] = 0xfffffffeu;
    return;
  }
  for (var i = 0u; i < 75u; i = i + 1u) {
    let c = dados.clausulas[i];
    if (((a & c.x) == 0u) && (((~a) & c.y & 0xfffffu) == 0u)) {
      testemunhos[a] = i;
      return;
    }
  }
  testemunhos[a] = 0xffffffffu;
}
