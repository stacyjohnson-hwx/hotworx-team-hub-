import { useAuth } from '@/contexts/AuthContext'

export function useRole() {
  const { role, user } = useAuth()

  return {
    role,
    user,                          // full auth user object
    userId: user?.id ?? null,
    isOwner: role === 'owner',
    isManager: role === 'manager',
    isTSA: role === 'tsa',
    isOwnerOrManager: role === 'owner' || role === 'manager',
    canEdit: (module) => canEditModule(role, module),
  }
}

function canEditModule(role, module) {
  if (role === 'owner') return true
  if (role === 'manager') {
    const managerReadOnly = ['owner-todo']
    return !managerReadOnly.includes(module)
  }
  const tsaEditable = ['eod', 'leads', 'cleaning', 'timeoff']
  return tsaEditable.includes(module)
}
