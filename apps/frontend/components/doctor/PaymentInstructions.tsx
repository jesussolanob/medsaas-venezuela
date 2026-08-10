/**
 * PaymentInstructions — renderiza las instrucciones de pago de la plataforma.
 *
 * El texto vive en `app_settings.platform_payment_instructions` y lo edita el
 * super admin desde /admin/settings, así que llega como texto plano y puede
 * cambiar sin pasar por un deploy. Antes se pintaba en un solo párrafo corrido:
 * los datos bancarios quedaban embutidos en la prosa y había que leer toda la
 * frase para encontrar el número de cuenta, justo cuando el especialista está
 * por transferir.
 *
 * Convención del texto (simple a propósito, para que un admin la respete sin
 * saber Markdown):
 *
 *   - Una línea que empieza con "-", "•" o "·" es un ítem de lista.
 *   - Una línea que termina en ":" es el título del grupo que sigue.
 *   - El resto son párrafos.
 *   - Dentro de un ítem, lo que va antes del primer ":" es la etiqueta y se
 *     destaca ("Banco: Mercantil" → **Banco** Mercantil).
 *
 * Si el admin escribe un párrafo corrido sin viñetas, se sigue viendo bien:
 * degrada a párrafos, nunca rompe.
 */

const BULLET_PREFIX = /^\s*[-•·*]\s+/;

interface ParsedLine {
  kind: 'heading' | 'item' | 'paragraph';
  label?: string;
  text: string;
}

/** Parte el texto plano en líneas tipadas. Exportada para poder testearla. */
export function parseInstructions(raw: string): ParsedLine[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line): ParsedLine => {
      if (BULLET_PREFIX.test(line)) {
        const body = line.replace(BULLET_PREFIX, '');
        const sep = body.indexOf(':');
        // Solo se trata como etiqueta si el ":" está cerca del inicio; así
        // "Incluya su cédula: es importante" no parte una oración larga.
        if (sep > 0 && sep <= 24) {
          return {
            kind: 'item',
            label: body.slice(0, sep).trim(),
            text: body.slice(sep + 1).trim(),
          };
        }
        return { kind: 'item', text: body };
      }
      if (line.endsWith(':')) return { kind: 'heading', text: line.slice(0, -1) };
      return { kind: 'paragraph', text: line };
    });
}

interface Props {
  /** Texto crudo de `app_settings.platform_payment_instructions`. */
  value: string;
}

export default function PaymentInstructions({ value }: Props) {
  const lines = parseInstructions(value);

  if (lines.length === 0) return null;

  return (
    <div
      className="rounded-xl p-4 text-sm leading-relaxed flex flex-col gap-3"
      style={{
        background: 'var(--dh-gray-50)',
        color: 'var(--dh-gray-800)',
        border: '1px solid var(--dh-gray-100)',
      }}
    >
      {groupLines(lines).map((group, gi) =>
        group.kind === 'list' ? (
          <ul key={gi} className="flex flex-col gap-1.5 pl-0.5">
            {group.items.map((item, ii) => (
              <li key={ii} className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="w-1.5 h-1.5 rounded-full shrink-0 mt-[0.5rem]"
                  style={{ background: 'var(--dh-turquoise)' }}
                />
                <span>
                  {item.label && (
                    <span className="font-semibold" style={{ color: 'var(--dh-gray-900)' }}>
                      {item.label}:{' '}
                    </span>
                  )}
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
        ) : group.line.kind === 'heading' ? (
          <p
            key={gi}
            className="text-xs font-bold uppercase tracking-wide"
            style={{ color: 'var(--dh-gray-600)' }}
          >
            {group.line.text}
          </p>
        ) : (
          <p key={gi}>{group.line.text}</p>
        ),
      )}
    </div>
  );
}

type Group = { kind: 'list'; items: ParsedLine[] } | { kind: 'single'; line: ParsedLine };

/** Junta ítems consecutivos en una sola lista para no abrir un <ul> por viñeta. */
function groupLines(lines: ParsedLine[]): Group[] {
  return lines.reduce<Group[]>((acc, line) => {
    if (line.kind === 'item') {
      const last = acc[acc.length - 1];
      if (last?.kind === 'list') {
        // Inmutable: se reemplaza el último grupo en vez de mutar su array.
        return [...acc.slice(0, -1), { kind: 'list', items: [...last.items, line] }];
      }
      return [...acc, { kind: 'list', items: [line] }];
    }
    return [...acc, { kind: 'single', line }];
  }, []);
}
