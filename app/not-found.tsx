import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px',
      textAlign: 'center'
    }}>
      <h1 style={{ fontSize: '4rem', margin: 0 }}>404</h1>
      <h2 style={{ fontSize: '2rem', margin: '20px 0' }}>Page Not Found</h2>
      <p style={{ fontSize: '1.2rem', marginBottom: '30px', color: '#666' }}>
        Could not find the requested resource
      </p>
      <Link
        href="/"
        style={{
          padding: '10px 20px',
          backgroundColor: '#0070f3',
          color: 'white',
          textDecoration: 'none',
          borderRadius: '5px',
          fontSize: '1rem'
        }}
      >
        Return Home
      </Link>
    </div>
  )
}
