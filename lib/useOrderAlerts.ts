'use client';
import { useCallback, useRef, useState } from 'react';
export function useOrderAlerts(sound: string) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const getAudio = useCallback(() => {
    if (!audio.current) { audio.current = new Audio(sound); audio.current.preload = 'auto'; }
    return audio.current;
  }, [sound]);
  const enable = useCallback(async () => {
    const player = getAudio();
    // Start playback inside the tap handler, before any permission await.
    const playback = player.play().then(() => true).catch(() => false);
    let permission: NotificationPermission | 'unsupported' = 'unsupported';
    if ('Notification' in window) {
      permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
    }
    if ('serviceWorker' in navigator && permission === 'granted') {
      try { registration.current = await navigator.serviceWorker.register('/order-alerts-sw.js'); await navigator.serviceWorker.ready; }
      catch { /* The page banner and sound remain available. */ }
    }
    const played = await playback;
    setEnabled(played);
    setMessage(!played ? 'El navegador bloqueó el sonido. Tocá Activar avisos para reintentar.' : permission === 'granted' ? 'Sonido activado y notificaciones permitidas. Mantené esta página abierta.' : permission === 'denied' ? 'Sonido activado. Las notificaciones están bloqueadas: habilitalas en los permisos del sitio.' : 'Sonido activado. Este navegador no habilitó notificaciones; verás el aviso en esta página.');
  }, [getAudio]);
  const notify = useCallback(async (title: string, body: string, tag: string) => {
    setNotice(`${title}. ${body}`);
    const player = getAudio(); player.currentTime = 0;
    await player.play().catch(() => { setEnabled(false); setMessage('Tocá Activar avisos para permitir el sonido.'); });
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const worker = registration.current || ('serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/order-alerts-sw.js') : undefined);
      if (worker) await worker.showNotification(title, { body, tag, icon: '/logo-smart.png', data: { url: window.location.href } });
      else new Notification(title, { body, tag, icon: '/logo-smart.png' });
    } catch { /* In-page notice remains visible when OS notifications are unsupported. */ }
  }, [getAudio]);
  return { enable, notify, enabled, message, notice, dismiss: () => setNotice('') };
}
export type OrderAlerts = ReturnType<typeof useOrderAlerts>;
