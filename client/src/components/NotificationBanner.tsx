interface Props {
    onAccept: () => void;
    onDismiss: () => void;
}

export default function NotificationBanner({ onAccept, onDismiss }: Props) {
    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-800 border border-gray-600 rounded-2xl px-4 py-3 shadow-xl text-sm max-w-sm w-full mx-4">
            <span className="text-lg">🔔</span>
            <span className="text-gray-300 flex-1">Être notifié quand c'est ton tour ?</span>
            <button
                onClick={onAccept}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3 py-1 rounded-lg transition-colors whitespace-nowrap"
            >
                Activer
            </button>
            <button
                onClick={onDismiss}
                className="text-gray-500 hover:text-gray-300 transition-colors"
                aria-label="Ignorer"
            >
                ✕
            </button>
        </div>
    );
}
