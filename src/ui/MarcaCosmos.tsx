import logoCosmos from '../assets/cosmos-app.png'

export function MarcaCosmos({ className = '' }: { className?: string }) {
  return (
    <svg class={`cosmos-curva ${className}`} viewBox="190 180 560 600" aria-hidden="true" overflow="hidden">
      <image href={logoCosmos} x="0" y="0" width="960" height="960" />
    </svg>
  )
}
