import SellerPortalClient from './SellerPortalClient';

/**
 * /seller — portal del vendedor.
 *
 * Rol recortado a dos cosas: dar de alta especialistas y ver los que registró.
 * La guarda de ruta está en `proxy.ts` (solo `seller`, más `super_admin` para
 * soporte); acá no se repite para que exista un solo lugar donde se decide.
 */
export const metadata = {
  title: 'Portal del vendedor · Delta Medical',
};

export default function SellerPage() {
  return <SellerPortalClient />;
}
