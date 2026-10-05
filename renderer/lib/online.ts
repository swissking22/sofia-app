import React from 'react'

/** Browser / Electron renderer online status (`navigator.onLine` + events). */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = React.useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  React.useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    setOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return online
}
