import http from './http'

export interface UserInfo {
  id: number
  username: string
  email?: string
  nickname?: string
  role: string
  points: number
}

export interface LoginResponse {
  token: string
  user: UserInfo
}

export type CodePurpose = 'register' | 'login' | 'reset_password'

export const authApi = {
  login(account: string, password: string) {
    return http.post<{ success: boolean; data: LoginResponse }>('/auth/login', { account, password })
  },
  logout() {
    return http.post('/auth/logout')
  },
  me() {
    return http.get<{ success: boolean; data: UserInfo }>('/me')
  },
  sendCode(email: string, purpose: CodePurpose) {
    return http.post('/auth/send-code', { email, purpose })
  },
  register(email: string, code: string, password: string) {
    return http.post<{ success: boolean; data: LoginResponse }>('/auth/register', { email, code, password })
  },
  loginCode(email: string, code: string) {
    return http.post<{ success: boolean; data: LoginResponse }>('/auth/login-code', { email, code })
  },
  resetPassword(email: string, code: string, newPassword: string) {
    return http.post('/auth/reset-password', { email, code, new_password: newPassword })
  },
  updateProfile(nickname: string) {
    return http.put('/me/profile', { nickname })
  },
  updatePassword(oldPassword: string, newPassword: string) {
    return http.put('/me/password', { old_password: oldPassword, new_password: newPassword })
  },
}
