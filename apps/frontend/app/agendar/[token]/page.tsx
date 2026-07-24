/**
 * /agendar/[token]
 *
 * Página pública — sin auth, sin sidebar.
 * El paciente llega aquí desde el link del email de consulta pendiente.
 *
 * Server Component: extrae el token del path y lo pasa al client.
 * La info del token se consulta client-side al montar (mismo patrón que /cita/confirmar).
 */

import AgendarTokenClient from './AgendarTokenClient';

export default async function AgendarTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AgendarTokenClient token={token} />;
}
