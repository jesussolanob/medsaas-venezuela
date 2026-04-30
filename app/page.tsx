export default function Home() {
  return (
    <iframe
      src="/landing.html"
      // F4 (2026-04-29): 100vh corta el iframe en Safari iOS por la barra de URL.
      // Usamos 100dvh con fallback a 100vh para navegadores antiguos.
      style={{
        width: '100vw',
        height: '100dvh',
        minHeight: '100vh',
        border: 'none',
        display: 'block',
        overflow: 'hidden',
      }}
      title="Delta Medical CRM"
    />
  )
}
