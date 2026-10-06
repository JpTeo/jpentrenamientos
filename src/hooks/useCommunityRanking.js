import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { buildRanking } from '../lib/community'

// Live ranking of every student of `coachId` (Comunidad JP).
export function useCommunityRanking(coachId) {
  const [profiles, setProfiles] = useState([])
  const [completions, setCompletions] = useState([])
  const [checkins, setCheckins] = useState([])
  const [loaded, setLoaded] = useState({
    communityProfiles: false,
    challengeCompletions: false,
    trainingCheckins: false,
  })
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!coachId) return
    const watch = (name, setter, mapper) =>
      onSnapshot(
        query(collection(db, name), where('coachId', '==', coachId)),
        (snap) => {
          setter(snap.docs.map(mapper))
          setLoaded((l) => ({ ...l, [name]: true }))
        },
        () => {
          setError(true)
          setLoaded((l) => ({ ...l, [name]: true }))
        },
      )
    const unsubs = [
      watch('communityProfiles', setProfiles, (d) => ({ id: d.id, ...d.data() })),
      watch('challengeCompletions', setCompletions, (d) => d.data()),
      watch('trainingCheckins', setCheckins, (d) => d.data()),
    ]
    return () => unsubs.forEach((u) => u())
  }, [coachId])

  const rows = useMemo(
    () => buildRanking(profiles, completions, checkins),
    [profiles, completions, checkins],
  )

  return {
    rows,
    loading: Boolean(coachId) && !(loaded.communityProfiles && loaded.challengeCompletions && loaded.trainingCheckins),
    error,
  }
}
