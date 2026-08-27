import mongoose from 'mongoose';
import { GROUP_ROLES, GROUP_ROLE_VALUES, INVITE_STATUS, INVITE_STATUS_VALUES, LIMITS } from '../config/constants.js';
import { hashToken, randomToken } from '../utils/tokens.js';

const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: GROUP_ROLE_VALUES, default: GROUP_ROLES.MEMBER },
    joinedAt: { type: Date, default: Date.now },

    shareLocation: { type: Boolean, default: false },
    lastLocation: {
      coordinates: { type: [Number], default: undefined },
      accuracy: { type: Number, default: null },
      updatedAt: { type: Date, default: null },
    },

    muted: { type: Boolean, default: false },
    lastReadAt: { type: Date, default: null },
  },
  { _id: false }
);

const inviteSchema = new mongoose.Schema(
  {
    email: { type: String, trim: true, lowercase: true, required: true },
    invitedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: INVITE_STATUS_VALUES, default: INVITE_STATUS.PENDING },

    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const safetyGroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please name your group.'],
      trim: true,
      minlength: [3, 'Group names must be at least 3 characters.'],
      maxlength: [80, 'Group names cannot be longer than 80 characters.'],
    },

    description: { type: String, trim: true, maxlength: 500, default: '' },

    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    members: {
      type: [memberSchema],
      default: [],
      validate: {
        validator: (v) => v.length <= LIMITS.MAX_GROUP_MEMBERS,
        message: `A group cannot have more than ${LIMITS.MAX_GROUP_MEMBERS} members.`,
      },
    },

    invites: { type: [inviteSchema], default: [] },

    alertMembersOnSos: { type: Boolean, default: true },

    isArchived: { type: Boolean, default: false },
    lastMessageAt: { type: Date, default: null },
    messageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

safetyGroupSchema.index({ 'members.user': 1, isArchived: 1 });
safetyGroupSchema.index({ 'invites.email': 1, 'invites.status': 1 });
safetyGroupSchema.index({ owner: 1, createdAt: -1 });

safetyGroupSchema.virtual('memberCount').get(function memberCount() {
  return this.members.length;
});

safetyGroupSchema.methods.findMember = function findMember(userId) {
  const target = String(userId);
  return this.members.find((member) => String(member.user._id || member.user) === target);
};

safetyGroupSchema.methods.isMember = function isMember(userId) {
  return Boolean(this.findMember(userId));
};

safetyGroupSchema.methods.canManage = function canManage(userId) {
  const member = this.findMember(userId);
  if (!member) return false;
  return member.role === GROUP_ROLES.OWNER || member.role === GROUP_ROLES.ADMIN;
};

safetyGroupSchema.methods.createInvite = function createInvite({ email, invitedBy, invitedUser }) {
  const normalised = String(email).trim().toLowerCase();

  for (const invite of this.invites) {
    if (invite.email === normalised && invite.status === INVITE_STATUS.PENDING) {
      invite.status = INVITE_STATUS.REVOKED;
      invite.respondedAt = new Date();
    }
  }

  const code = randomToken(20);
  this.invites.push({
    email: normalised,
    invitedUser: invitedUser || null,
    invitedBy,
    codeHash: hashToken(code),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return { code, invite: this.invites[this.invites.length - 1] };
};

safetyGroupSchema.statics.forMember = function forMember(userId) {
  return this.find({ 'members.user': userId, isArchived: false });
};

export default mongoose.model('SafetyGroup', safetyGroupSchema);
