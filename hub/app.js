'use strict';
const $ = (selector) => document.querySelector(selector);
const NOTE_KEY = 'cosmos.hub.drafts.v1';
const SESSION_KEY = 'cosmos.hub.principia.session';
const categories = ['Lei', 'Fato', 'Visão de mundo', 'Teorema'];
let notes = [], activeFilter = 'Todas', editing = null, schema = [], schemaError = '';
let noticeTimer;
function notify(message) {
  $('#notice').textContent = message;
  $('#notice').hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('#notice').hidden = true; }, 6500);
}
function persist(next) {
  try { localStorage.setItem(NOTE_KEY, JSON.stringify(next)); notes = next; return true; }
  catch { notify('Não foi possível salvar neste navegador. Sua edição continua aberta.'); return false; }
}
try {
  const saved = JSON.parse(localStorage.getItem(NOTE_KEY) || '[]');
  if (!Array.isArray(saved) || saved.some(n => !n || typeof n.id !== 'string' || typeof n.title !== 'string' || typeof n.body !== 'string' || !categories.includes(n.category))) throw new Error();
  notes = saved;
} catch { notify('Não foi possível ler as notas locais. Nenhum dado foi apagado.'); }
const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function render() {
  const query = fold($('#search').value.trim());
  const visible = notes.filter(n => (activeFilter === 'Todas' || n.category === activeFilter) && fold(n.title + ' ' + n.body).includes(query));
  $('#count').textContent = `${visible.length} ${visible.length === 1 ? 'nota' : 'notas'}`;
  $('#notes').replaceChildren();
  $('#empty').hidden = visible.length > 0;
  $('#empty h2').textContent = notes.length ? 'Nenhuma nota encontrada' : 'Nenhuma nota ainda';
  $('#empty > p:not(.eyebrow)').textContent = notes.length ? 'Tente outra busca ou escolha um filtro diferente.' : 'Uma pergunta, uma observação, uma visão de mundo. Seu próximo registro começa com você.';
  $('#first-note').textContent = notes.length ? 'Limpar busca e filtros ↗' : 'Criar minha primeira nota ↗';
  for (const note of visible) {
    const article = document.createElement('article'); article.className = 'note';
    const meta = document.createElement('div'); meta.className = 'note-meta';
    const category = document.createElement('span'); category.textContent = note.category;
    const status = document.createElement('span'); status.textContent = 'Rascunho local'; meta.append(category, status);
    const title = document.createElement('h2'); title.textContent = note.title;
    const body = document.createElement('p'); body.textContent = note.body;
    const actions = document.createElement('div'); actions.className = 'note-actions';
    const edit = document.createElement('button'); edit.textContent = 'Editar'; edit.onclick = () => openNote(note);
    const remove = document.createElement('button'); remove.textContent = 'Excluir'; remove.onclick = () => {
      if (confirm(`Excluir a nota “${note.title}”?`) && persist(notes.filter(n => n.id !== note.id))) { render(); notify('Nota excluída deste navegador.'); }
    };
    actions.append(edit, remove); article.append(meta, title, body, actions); $('#notes').append(article);
  }
}
function openNote(note) {
  editing = note?.id || null;
  const form = $('#note-form'); form.reset();
  form.elements.title.value = note?.title || '';
  form.elements.body.value = note?.body || '';
  form.elements.category.value = note?.category || (activeFilter === 'Todas' ? 'Visão de mundo' : activeFilter);
  $('#note-heading').textContent = note ? 'Editar nota' : 'Nova nota';
  $('#note-dialog').showModal(); form.elements.title.focus();
}
$('#new-note').onclick = () => openNote();
$('#first-note').onclick = () => {
  if (!notes.length) return openNote();
  $('#search').value = ''; activeFilter = 'Todas'; updateFilters(); render();
};
$('#note-form').onsubmit = (event) => {
  event.preventDefault(); const form = event.currentTarget;
  const title = form.elements.title.value.trim(), body = form.elements.body.value.trim();
  if (!title || !body) return notify('Preencha o título e o texto da nota.');
  const note = {id: editing || crypto.randomUUID(), title, body, category: form.elements.category.value};
  const next = editing ? notes.map(n => n.id === editing ? note : n) : [note, ...notes];
  if (!persist(next)) return;
  $('#note-dialog').close(); render(); notify('Nota salva somente neste navegador.');
};
function updateFilters() { document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === activeFilter))); }
$('#filters').onclick = (event) => { const b = event.target.closest('[data-filter]'); if (b) { activeFilter = b.dataset.filter; updateFilters(); render(); } };
$('#search').oninput = render;
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => button.closest('dialog').close());
document.addEventListener('keydown', event => {
  if (event.key === '/' && !document.querySelector('dialog[open]') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) { event.preventDefault(); $('#search').focus(); }
});
function keyState() {
  try { $('#key-state').textContent = sessionStorage.getItem(SESSION_KEY) ? 'Há uma chave guardada nesta sessão. O Principia permanece fechado.' : 'Nenhuma chave guardada nesta sessão.'; }
  catch { $('#key-state').textContent = 'O armazenamento de sessão não está disponível.'; }
}
$('#principia').onclick = () => { $('#key-form').reset(); keyState(); $('#key-dialog').showModal(); };
$('#key-form').onsubmit = event => {
  event.preventDefault(); const input = event.currentTarget.elements.key;
  try { sessionStorage.setItem(SESSION_KEY, input.value); input.value = ''; keyState(); notify('Chave guardada nesta sessão. O Principia permanece fechado.'); }
  catch { notify('Não foi possível guardar a chave nesta sessão.'); }
};
$('#key-dialog').addEventListener('close', () => $('#key-form').reset());
$('#forget-key').onclick = () => { try { sessionStorage.removeItem(SESSION_KEY); $('#key-form').reset(); keyState(); notify('Chave removida desta sessão.'); } catch { notify('Não foi possível acessar o armazenamento de sessão.'); } };
function showInfo(systems = false) {
  $('#info-title').textContent = systems ? 'Sistemas prontos' : 'A estrutura do caderno.';
  $('#info-copy').textContent = systems ? 'Nesta entrega, você pode consultar o formato público do caderno. A ativação de sistemas ainda não está conectada. Nenhuma nota é criada automaticamente.' : 'Campos lidos diretamente de FORMATO_v1.md. As notas desta tela são rascunhos pessoais; não são registros certificados.';
  $('#schema-fields').replaceChildren();
  if (!schema.length) { const p = document.createElement('p'); p.textContent = schemaError || 'Carregando o documento…'; $('#schema-fields').append(p); }
  for (const field of schema) { const row = document.createElement('div'); row.className = 'schema-field'; const name = document.createElement('strong'); name.textContent = field.name; const description = document.createElement('span'); description.textContent = field.description; row.append(name, description); $('#schema-fields').append(row); }
  $('#info-dialog').showModal();
}
$('#format').onclick = () => showInfo();
$('#systems').onclick = () => showInfo(true);
async function loadFormat() {
  try {
    const response = await fetch('../FORMATO_v1.md', {cache: 'no-cache'});
    if (!response.ok) throw new Error();
    const source = (await response.text()).replace(/\r\n/g, '\n');
    const table = source.split('| Campo | Conteúdo | No fechado |')[1]?.split('\n\n')[0];
    if (!table) throw new Error();
    const fields = table.split('\n').filter(line => line.startsWith('| `')).map(line => {
      const parts = line.split('|'); return {name: parts[1].trim().replaceAll('`', ''), description: parts[2].trim()};
    });
    if (fields.length !== 13 || new Set(fields.map(f => f.name)).size !== 13) throw new Error();
    schema = fields; $('#schema-status').textContent = '13 campos';
  } catch { schemaError = 'Não foi possível ler FORMATO_v1.md. Abra o hub por um servidor HTTP local a partir da raiz do repositório.'; $('#schema-status').textContent = 'Documento indisponível'; }
}
render(); loadFormat();
