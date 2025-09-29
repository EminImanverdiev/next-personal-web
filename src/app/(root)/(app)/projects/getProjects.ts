import { IRepository } from '@/types'
import timeFromNow from '@/utils/time-from-now'
import 'server-only'

const username = process.env.GH_USERNAME || 'EminImanverdiev'
const apiKey = process.env.GH_API_KEY
const baseUrl = `https://api.github.com/users/${username}/repos?type=all&sort=updated&per_page=100`

const fetchOptions: RequestInit = {
  method: 'GET',
  headers: {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}),
  },
  next: { revalidate: 60 * 60 * 24 }, // 1 gün
}

async function fetchAllPublicRepos(): Promise<any[]> {
  let page = 1
  const all: any[] = []

  while (true) {
    const url = `${baseUrl}&page=${page}`
    const res = await fetch(url, fetchOptions)
    if (!res.ok) {
      throw new Error(`Failed to fetch repos page ${page}: ${res.status} ${res.statusText}`)
    }
    const batch = (await res.json()) as any[]
    all.push(...batch)
    if (batch.length < 100) break
    page++
  }

  return all
}

async function fetchLastCommitDate(fullName: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${fullName}/commits?per_page=1`, fetchOptions)
    if (!res.ok) return null
    const list = (await res.json()) as any[]
    const last = Array.isArray(list) ? list[0] : undefined
    return last?.commit?.committer?.date ?? null
  } catch {
    return null
  }
}

const getProjects = async (): Promise<IRepository[]> => {
  let repositories = await fetchAllPublicRepos()

  repositories = repositories.filter((repo) => !!repo.languages_url)

  const projects = await Promise.all(
    repositories.map(async (repo) => {
      const [languagesRes, lastCommitDate] = await Promise.all([
        fetch(repo.languages_url, fetchOptions),
        fetchLastCommitDate(repo.full_name),
      ])

      const languagesData = (await languagesRes.json()) as Record<string, number>
      const totalSize = Object.values(languagesData).reduce((acc, n) => acc + (n || 0), 0)

      const languages =
        totalSize > 0
          ? Object.entries(languagesData).map(([name, size]) => ({
              name,
              size: (size / totalSize) * 100,
            }))
          : []

      const lastDate = lastCommitDate ?? ''

      const repository: IRepository = {
        id: repo.id,
        node_id: repo.node_id,
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        html_url: repo.html_url,
        stargazers_url: repo.stargazers_url,
        forks_url: repo.forks_url,
        homepage: repo.homepage,
        license: repo.license,
        stargazers_count: repo.stargazers_count,
        watchers_count: repo.watchers_count,
        forks_count: repo.forks_count,
        topics: repo.topics ?? [],
        languages,
        created_at: timeFromNow(repo.created_at),
        updated_at: timeFromNow(repo.updated_at),
        pushed_at: timeFromNow(repo.pushed_at),
        last_commit_date: lastDate,
        last_commit_at: lastDate ? timeFromNow(lastDate) : 'N/A',
      }

      return repository
    }),
  )

  projects.sort((a, b) => {
    if (!a.last_commit_date) return 1
    if (!b.last_commit_date) return -1
    return new Date(b.last_commit_date).getTime() - new Date(a.last_commit_date).getTime()
  })

  return projects
}

export default getProjects
