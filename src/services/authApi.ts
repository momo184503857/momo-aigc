import http from './http'

export interface LoginResponse {
  token: string
  user: { id: number; username: string; role: string }
}

export const authApi = {
  login(username: string, password: string) {
    return http.post<{ success: boolean; data: LoginResponse }>('/auth/login', { username, password })
  },
  logout() {
    return http.post('/auth/logout')
  },
  me() {
    return http.get<{ success: boolean; data: { id: number; username: string; role: string } }>('/me')
  },
}
