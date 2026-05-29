import http from './http'

export interface UserInfo {
  id: number
  username: string
  role: string
  points: number
}

export interface LoginResponse {
  token: string
  user: UserInfo
}

export const authApi = {
  login(username: string, password: string) {
    return http.post<{ success: boolean; data: LoginResponse }>('/auth/login', { username, password })
  },
  logout() {
    return http.post('/auth/logout')
  },
  me() {
    return http.get<{ success: boolean; data: UserInfo }>('/me')
  },
}
