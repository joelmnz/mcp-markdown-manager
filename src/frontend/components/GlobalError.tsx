import React, { useState } from 'react';

interface GlobalErrorProps {
    title?: string;
    message?: string;
    details?: any;
    onRetry?: () => void;
}

export const GlobalError: React.FC<GlobalErrorProps> = ({
    title = 'System Error',
    message = 'The application encountered a critical error.',
    details,
    onRetry
}) => {
    const [showDetails, setShowDetails] = useState(false);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            padding: '2rem',
            backgroundColor: 'var(--bg-primary, #1a1a1a)',
            color: 'var(--text-primary, #ffffff)',
            fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
            <div style={{
                maxWidth: '600px',
                width: '100%',
                textAlign: 'center',
                padding: '2rem',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-secondary, #2d2d2d)',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>

                <h1 style={{
                    margin: '0 0 1rem 0',
                    fontSize: '1.5rem',
                    fontWeight: 600
                }}>
                    {title}
                </h1>

                <p style={{
                    margin: '0 0 2rem 0',
                    lineHeight: '1.5',
                    color: 'var(--text-secondary, #a0a0a0)'
                }}>
                    {message}
                </p>

                {details && (
                    <div style={{ marginBottom: '2rem', textAlign: 'left' }}>
                        <button
                            onClick={() => setShowDetails(!showDetails)}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--accent-color, #4a9eff)',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                textDecoration: 'underline',
                                padding: 0,
                                marginBottom: showDetails ? '1rem' : 0
                            }}
                        >
                            {showDetails ? 'Hide Details' : 'Show Details'}
                        </button>

                        {showDetails && (
                            <pre style={{
                                padding: '1rem',
                                backgroundColor: 'rgba(0,0,0,0.3)',
                                borderRadius: '4px',
                                overflowX: 'auto',
                                fontSize: '0.85rem',
                                color: '#ff6b6b',
                                border: '1px solid rgba(255,107,107,0.2)'
                            }}>
                                {JSON.stringify(details, null, 2)}
                            </pre>
                        )}
                    </div>
                )}

                {onRetry && (
                    <button
                        onClick={onRetry}
                        style={{
                            padding: '0.75rem 2rem',
                            backgroundColor: 'var(--accent-color, #4a9eff)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '1rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'opacity 0.2s ease'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
                        onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                    >
                        Retry Application
                    </button>
                )}
            </div>
        </div>
    );
};
