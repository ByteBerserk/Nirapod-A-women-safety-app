import { idOf } from './present.js';

function self(user) {
  if (!user) return null;

  return {
    id: idOf(user),
    name: user.name,
    username: user.username,
    email: user.email,
    phone: user.phone || '',
    avatar: user.avatar || '',
    gender: user.gender,
    dateOfBirth: user.dateOfBirth || null,
    bloodGroup: user.bloodGroup,
    medicalInfo: user.medicalInfo || '',
    address: {
      line1: user.address?.line1 || '',
      city: user.address?.city || '',
      state: user.address?.state || '',
      postalCode: user.address?.postalCode || '',
      country: user.address?.country || '',
    },
    role: user.role,
    accountStatus: user.accountStatus,
    notificationPrefs: {
      emailSosAlerts: user.notificationPrefs?.emailSosAlerts ?? true,
      emailGroupAlerts: user.notificationPrefs?.emailGroupAlerts ?? true,
      emailSafePlace: user.notificationPrefs?.emailSafePlace ?? false,
      inAppNotifications: user.notificationPrefs?.inAppNotifications ?? true,
    },
    privacyPrefs: {
      shareLocationWithGroups: user.privacyPrefs?.shareLocationWithGroups ?? false,
      showProfileToGroupMembers: user.privacyPrefs?.showProfileToGroupMembers ?? true,
      notifyContactsOnSafePlace: user.privacyPrefs?.notifyContactsOnSafePlace ?? false,
    },
    lastLoginAt: user.lastLoginAt || null,
    createdAt: user.createdAt,
  };
}

function publicProfile(user) {
  if (!user) return null;
  return {
    id: idOf(user),
    name: user.name,
    username: user.username,
    avatar: user.avatar || '',
    role: user.role,
  };
}

function author(user, isAnonymous = false) {
  if (isAnonymous) {
    return { id: null, name: 'Anonymous', username: null, avatar: '', isAnonymous: true };
  }
  if (!user) {
    return { id: null, name: 'Deleted user', username: null, avatar: '', isAnonymous: false };
  }
  return { ...publicProfile(user), isAnonymous: false };
}

function groupMember(member) {
  if (!member) return null;
  const user = member.user;

  return {
    ...publicProfile(user),
    groupRole: member.role,
    joinedAt: member.joinedAt,
    shareLocation: Boolean(member.shareLocation),

    lastLocation: member.shareLocation && member.lastLocation?.coordinates
      ? {
          lat: member.lastLocation.coordinates[1],
          lng: member.lastLocation.coordinates[0],
          accuracy: member.lastLocation.accuracy ?? null,
          updatedAt: member.lastLocation.updatedAt,
        }
      : null,
  };
}

function adminRow(user) {
  if (!user) return null;
  return {
    id: idOf(user),
    name: user.name,
    username: user.username,
    email: user.email,
    phone: user.phone || '',
    avatar: user.avatar || '',
    role: user.role,
    accountStatus: user.accountStatus,
    suspension: user.suspension
      ? {
          reason: user.suspension.reason || '',
          until: user.suspension.until || null,
          at: user.suspension.at || null,
        }
      : null,
    lastLoginAt: user.lastLoginAt || null,
    createdAt: user.createdAt,
  };
}

export { self, publicProfile, author, groupMember, adminRow };
