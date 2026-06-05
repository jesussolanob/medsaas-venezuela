'use client';

import { useEffect, useState } from 'react';
import { MessageCircle, Search } from 'lucide-react';
import {
  listMessageThreads,
  getMessageThread,
  sendMessage,
  type ConversationView,
  type MessageView,
} from './actions';

// ConversationView and MessageView are imported from ./actions.
// Keeping local aliases so the JSX below compiles without changes.
type Conversation = ConversationView;
type Message = MessageView;

export default function DoctorMessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  // patientName is derived from the selected conversation (already masked by backend)
  const [selectedPatientName, setSelectedPatientName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    // NOTE: Realtime (postgres_changes) subscription removed — no WS replacement in Etapa 1.
    // Messages refresh only on explicit user interaction (select conversation / send message).
    listMessageThreads().then((threads) => {
      setConversations(threads);
      setLoading(false);
    });
  }, []);

  const handleSelectConversation = async (patientId: string) => {
    setSelectedPatientId(patientId);
    setLoadingThread(true);
    setSendError(null);

    // Resolve patient display name from the already-loaded conversations list
    const conv = conversations.find((c) => c.patient_id === patientId);
    setSelectedPatientName(conv?.patient_name ?? 'Paciente');

    const { messages: msgs, error } = await getMessageThread(patientId);
    if (!error) {
      setMessages(msgs);
    }
    setLoadingThread(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedPatientId) return;

    setSendingMessage(true);
    setSendError(null);
    try {
      const { message, error } = await sendMessage(selectedPatientId, newMessage);

      if (error) {
        setSendError(error);
        return;
      }

      setNewMessage('');

      // Append the sent message optimistically; fallback to re-fetching the full thread
      if (message) {
        setMessages((prev) => [...prev, message]);
      } else {
        const { messages: refreshed } = await getMessageThread(selectedPatientId);
        setMessages(refreshed);
      }
    } finally {
      setSendingMessage(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-slate-500">Cargando mensajes...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-6">
      {/* Lista de conversaciones */}
      <div className="w-80 border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar paciente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center">
              <MessageCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Sin conversaciones</p>
            </div>
          ) : (
            conversations
              .filter((c) => c.patient_name.toLowerCase().includes(searchTerm.toLowerCase()))
              .map((conv) => (
                <button
                  key={conv.patient_id}
                  onClick={() => handleSelectConversation(conv.patient_id)}
                  className={`w-full text-left p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                    selectedPatientId === conv.patient_id ? 'bg-slate-50' : ''
                  }`}
                >
                  <p className="font-semibold text-slate-900 text-sm">{conv.patient_name}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(conv.last_message_time).toLocaleDateString('es-VE')}
                  </p>
                  {conv.unread_count > 0 && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-500 text-white mt-1">
                      {conv.unread_count}
                    </span>
                  )}
                </button>
              ))
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col">
        {selectedPatientId ? (
          <>
            {/* Header */}
            <div className="p-6 border-b border-slate-200 bg-white rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{selectedPatientName}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Los datos de contacto se muestran en la ficha del paciente
                  </p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loadingThread ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-slate-400 text-sm">Cargando mensajes...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-slate-500 text-sm">Inicia una conversación</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${
                      msg.direction === 'doctor_to_patient' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-xs px-4 py-2 rounded-xl text-sm ${
                        msg.direction === 'doctor_to_patient'
                          ? 'bg-teal-500 text-white'
                          : 'bg-slate-100 text-slate-900'
                      }`}
                    >
                      {msg.body}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Send error */}
            {sendError && (
              <p className="px-6 pb-2 text-xs text-red-500">{sendError}</p>
            )}

            {/* Input */}
            <form
              onSubmit={handleSendMessage}
              className="p-6 border-t border-slate-200 bg-white rounded-b-2xl flex gap-2"
            >
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Escribe tu respuesta..."
                className="flex-1 px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
              />
              <button
                type="submit"
                disabled={sendingMessage || !newMessage.trim()}
                className="px-4 py-2 rounded-lg bg-teal-500 text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {sendingMessage ? '...' : 'Enviar'}
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">Selecciona una conversación</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
