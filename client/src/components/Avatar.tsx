interface AvatarProps {
    username: string;
    gravatarUrl?: string | null;
    size?: 'sm' | 'md' | 'lg';
}

const sizes = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-16 h-16 text-2xl',
};

export default function Avatar({ username, gravatarUrl, size = 'md' }: AvatarProps) {
    const sizeClass = sizes[size];

    if (gravatarUrl) {
        return (
            <img
                src={gravatarUrl}
                alt={username}
                className={`${sizeClass} rounded-full object-cover shrink-0`}
            />
        );
    }

    return (
        <div className={`${sizeClass} rounded-full bg-indigo-600 flex items-center justify-center font-bold shrink-0`}>
            {username[0].toUpperCase()}
        </div>
    );
}
