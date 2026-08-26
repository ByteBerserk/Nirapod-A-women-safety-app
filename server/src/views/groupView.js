import * as userView from './userView.js';
import { INVITE_STATUS } from '../config/constants.js';
import { idOf } from './present.js';


/** Card in "my groups". No member list - that needs a detail request. */
function summary(group, viewerId) {
  if (!group) return null;

  const me = (group.members || []).find((m) => String(idOf(m.user)) === String(viewerId));

  return {
    id: idOf(group),
    name: group.name,
    description: group.description || '',
    memberCount: (group.members || []).length,
    owner: userView.publicProfile(group.owner),
    isOwner: String(idOf(group.owner)) === String(viewerId),
    myRole: me?.role || null,
    myShareLocation: Boolean(me?.shareLocation),
    alertMembersOnSos: Boolean(group.alertMembersOnSos),
    lastMessageAt: group.lastMessageAt || null,
    messageCount: group.messageCount || 0,
    createdAt: group.createdAt,
  };
}

/**
 * Full detail. Member coordinates only appear for members who switched sharing
 * on - the presenter drops them for everyone else, so a client bug cannot
 * expose a location the owner never agreed to share (FR-16, NFR-5).
 */
function detail(group, viewerId) {
  if (!group) return null;

  const me = (group.members || []).find((m) => String(idOf(m.user)) === String(viewerId));
  const canManage = me && (me.role === 'owner' || me.role === 'admin');

  const result = {
    ...summary(group, viewerId),
    members: (group.members || []).map((member) => userView.groupMember(member)),
    canManage: Boolean(canManage),
  };

  // Only managers see the invite list - it contains email addresses.
  if (canManage) {
    result.invites = (group.invites || [])
      .filter((invite) => invite.status === INVITE_STATUS.PENDING)
      .map((invite) => ({
        id: idOf(invite),
        email: invite.email,
        invitedBy: userView.publicProfile(invite.invitedBy),
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        isExpired: new Date(invite.expiresAt).getTime() < Date.now(),
      }));
  }

  return result;
}

/** An invitation as it appears in the invitee's inbox screen. */
function invitation(group, invite) {
  return {
    inviteId: idOf(invite),
    group: {
      id: idOf(group),
      name: group.name,
      description: group.description || '',
      memberCount: (group.members || []).length,
    },
    invitedBy: userView.publicProfile(invite.invitedBy),
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    isExpired: new Date(invite.expiresAt).getTime() < Date.now(),
  };
}

function message(doc, viewerId) {
  if (!doc) return null;

  return {
    id: idOf(doc),
    type: doc.type,
    body: doc.isRemoved ? '[Message removed]' : doc.body,
    sender: doc.sender ? userView.publicProfile(doc.sender) : null,
    isSystem: doc.type === 'system',
    isMine: Boolean(doc.sender && String(idOf(doc.sender)) === String(viewerId)),
    location: Array.isArray(doc.location?.coordinates)
      ? {
          lat: doc.location.coordinates[1],
          lng: doc.location.coordinates[0],
          accuracy: doc.location.accuracy ?? null,
          label: doc.location.label || '',
        }
      : null,
    relatedSos: idOf(doc.relatedSos),
    isRemoved: Boolean(doc.isRemoved),
    readCount: (doc.readBy || []).length,
    createdAt: doc.createdAt,
  };
}

export { summary, detail, invitation, message };