/**
 * /api/doctor/notifications — GET lista de notificaciones + conteo de no leídas.
 *
 * ADR-022: route handler (no Server Action) para que el polling no truene
 * "Server Action not found" después de un deploy.
 *
 * Proxies to: GET /api/doctor/notifications (backend)
 * Response:   { success: true, data: { items: NotificationItem[], unreadCount: number } }
 */
import { NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  items: NotificationItem[];
  unreadCount: number;
}

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const result = await backendGet<NotificationsResponse>('/doctor/notifications');

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
