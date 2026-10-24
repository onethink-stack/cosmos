/** @jsxImportSource react */
export function BarraJanela() {
  return <div className="cosmos-window-bar"><span className="cosmos-window-dots" aria-hidden="true"><i /><i /><i /></span><span>Cosmos</span></div>
}

export function Icone({ nome }: { nome: 'chat' | 'book' | 'tools' | 'settings' | 'file' | 'shield' | 'paperclip' | 'send' }) {
  const caminhos = {
    chat: 'M5 4h14v11H9l-4 4V4Zm4 4h6m-6 3h4',
    book: 'M4 4h6c1 0 2 1 2 2 0-1 1-2 2-2h6v15h-6c-1 0-2 1-2 1s-1-1-2-1H4V4Zm8 2v14',
    tools: 'm4 4 16 16m-4-16a5 5 0 0 0-5 7L4 18l2 2 7-7a5 5 0 0 0 7-5l-4 3-3-3 3-4Z',
    settings: 'm9 3 1 3h4l1-3 3 2-1 3 2 3 3 1-1 4-3 1-2 3-4-1-1-3-3-1-2-3 2-3-1-3 3-1 2-3Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
    file: 'M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6',
    shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
    paperclip: 'm8 8 7-5c5-3 8 2 5 5L9 19c-5 5-11-1-7-5L13 3m-7 9 8-8',
    send: 'm4 4 17 8-17 8 4-8-4-8Zm4 8h13',
  }
  return <svg className="cosmos-line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={caminhos[nome]} /></svg>
}
