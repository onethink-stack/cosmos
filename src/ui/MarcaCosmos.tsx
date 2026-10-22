import logoCosmos from '../assets/cosmos-app.png'

export function MarcaCosmos({ className = '' }: { className?: string }) {
  return (
    <img class={`cosmos-curva ${className}`} src={logoCosmos} width="512" height="512" alt="" aria-hidden="true" />
  )
}
