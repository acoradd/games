import { useState, useCallback } from 'react';

const STORAGE_KEY = 'notif-enabled';
const ASKED_KEY   = 'notif-asked';

function getEnabled(): boolean {
    return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function useNotifications() {
    const [permission, setPermission] = useState<NotificationPermission>(
        typeof Notification !== 'undefined' ? Notification.permission : 'denied'
    );
    const [enabled, setEnabled] = useState(getEnabled);

    const supported = typeof Notification !== 'undefined';
    const alreadyAsked = localStorage.getItem(ASKED_KEY) === 'true';

    const requestAndEnable = useCallback(async (): Promise<boolean> => {
        if (!supported) return false;
        localStorage.setItem(ASKED_KEY, 'true');
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result === 'granted') {
            localStorage.setItem(STORAGE_KEY, 'true');
            setEnabled(true);
            return true;
        }
        return false;
    }, [supported]);

    const disable = useCallback(() => {
        localStorage.setItem(STORAGE_KEY, 'false');
        setEnabled(false);
    }, []);

    const enable = useCallback(async (): Promise<boolean> => {
        if (!supported) return false;
        if (permission === 'granted') {
            localStorage.setItem(STORAGE_KEY, 'true');
            setEnabled(true);
            return true;
        }
        return requestAndEnable();
    }, [supported, permission, requestAndEnable]);

    const notify = useCallback((title: string, body?: string) => {
        if (!supported || !enabled || permission !== 'granted') return;
        if (!document.hidden) return;
        const notif = new Notification(title, { body, icon: '/favicon.png' });
        notif.onclick = () => { window.focus(); notif.close(); };
    }, [supported, enabled, permission]);

    return {
        supported,
        permission,
        enabled,
        alreadyAsked,
        requestAndEnable,
        enable,
        disable,
        notify,
    };
}
