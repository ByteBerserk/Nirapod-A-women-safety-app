/**
 * Creates the first administrator, builds the indexes, and loads a starter set
 * of safety resources so the app is not empty on first run.
 *
 *   npm --prefix server run seed
 *   npm --prefix server run seed -- --demo    (adds sample users and reports)
 */

import mongoose from 'mongoose';
import env from '../config/env.js';
import * as logger from '../config/logger.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';

import User from '../models/User.js';
import Resource from '../models/Resource.js';
import Incident from '../models/Incident.js';
import Comment from '../models/Comment.js';
import EmergencyContact from '../models/EmergencyContact.js';
import { ROLES, INCIDENT_STATUS } from '../config/constants.js';

const RESOURCES = [
  {
    title: 'Using the SOS button when you feel unsafe',
    category: 'emergency-guide',
    summary: 'What happens when you press SOS, and how to get the most out of it.',
    isPinned: true,
    content: `Press and hold the red SOS button on the home screen for one second. Holding rather
than tapping is deliberate - it stops the alert firing in your pocket.

The moment it fires, three things happen:

1. Everyone on your emergency contact list is emailed. The message contains your name, your
   phone number, your blood group and any medical notes you have saved, your coordinates, and
   a link to a live map.
2. Your location keeps updating on that map until you mark yourself safe. If you are moving,
   your contacts see you moving.
3. Every safety group you belong to is alerted in the app.

The live link stops working the moment you mark yourself safe, and expires by itself after 24
hours.

Before you ever need it:

- Add at least two emergency contacts. The button has nobody to alert until you do.
- Fill in your blood group and any medical conditions or allergies. Paramedics ask for these.
- Allow location access in your browser. Without it the alert still goes out, but without a map.

If you are in immediate danger, call your local emergency number as well. Nirapod alerts the
people who care about you; it does not dispatch an ambulance.`,
  },
  {
    title: 'Travelling alone at night',
    category: 'safety-tips',
    summary: 'Practical habits for late journeys, on foot and by taxi.',
    content: `Before you leave:

- Share your live location with a safety group, or tell one person your route and expected time.
- Charge your phone. A power bank is worth the weight.
- Save your destination as a safe place so the app tells your family when you arrive.

On foot:

- Walk facing oncoming traffic. It is harder for a vehicle to follow you.
- Keep one ear free. Two earphones remove your best early warning.
- Walk in the middle of the pavement, away from doorways, parked vans and alley mouths.
- If you think you are being followed, cross the road. Cross back. If they do the same, go into
  the nearest open shop and stay there.

In a taxi or ride-hail:

- Check the number plate against the app before you open the door.
- Sit in the back, on the side away from the kerb.
- Share your trip. Send the driver's details to someone.
- If the route feels wrong, say out loud that you want to stop. Do not wait to be polite.

Trust the feeling that something is off. It is usually your brain noticing something before you
can name it.`,
  },
  {
    title: 'What to do if you are being followed',
    category: 'safety-tips',
    summary: 'A short sequence that buys you distance and witnesses.',
    content: `Confirm it first. Change your pace. Cross the road. Turn a corner. If they match all
three, you are being followed.

Then, in order:

1. Get to people. A petrol station, a pharmacy, a fast-food restaurant, any shop with lights on.
   Do not go home - you do not want them to learn where you live.
2. Trigger an SOS. Your contacts get your live location without you having to speak.
3. Call someone and say where you are, loudly. "I'm on Green Road near the pharmacy" tells the
   person following you that somebody knows.
4. Do not run unless you know exactly where you are running to. Running turns a follower into a
   chaser, and you will not out-sprint someone for long.

If they close the distance, put an object between you - a parked car, a pillar, a bench. Shout
something specific: "Call the police" travels further than "help", because it tells bystanders
what to do.`,
  },
  {
    title: 'Basic self-defence for real situations',
    category: 'self-defense',
    summary: 'The few techniques worth knowing if you have never trained.',
    content: `Self-defence is escape, not victory. Every technique below exists to create two
seconds of space so you can run.

Targets that work regardless of size:

- Eyes. Fingers, thumbs, keys, anything.
- Throat. A short strike with the web of the hand.
- Knee, from the side. Legs do not bend that way.
- Instep. A heel driven straight down.

Getting out of a wrist grab: turn your arm so your thumb points towards the gap between their
thumb and fingers, then pull sharply. You are pulling against one thumb, not four fingers.

If someone grabs you from behind, drop your weight. Standing people are easy to carry; a person
who has suddenly become dead weight is not.

Your voice is a weapon. A loud, low "NO" or "BACK OFF" does two things: it can stop an
opportunist, and it puts witnesses on notice.

Everyday carry that is legal almost everywhere: a personal alarm. 130 decibels ends far more
incidents than any technique in this article.

None of this replaces training. A single weekend self-defence course is worth more than reading
about it.`,
  },
  {
    title: 'Your legal rights when reporting harassment',
    category: 'legal-rights',
    summary: 'What you are entitled to when you go to the police.',
    content: `These principles apply in most jurisdictions. Check your local law for specifics.

When you report:

- You are entitled to file a complaint at any station, regardless of where the incident happened.
  Many places call this a "zero FIR" and it must be transferred to the correct station.
- You are entitled to a free copy of your own complaint.
- You may be entitled to give your statement to a female officer, and at your home rather than at
  a station. In many jurisdictions this is a right, not a favour.
- You may have someone with you while you give your statement.
- Your identity is protected in cases of sexual offences. Publishing it is itself an offence in
  many places.

Evidence that helps:

- Screenshots with the timestamp and the sender's handle visible.
- A written timeline: date, time, place, what was said, who saw it.
- Medical records if there was any physical contact.
- Reports filed in this app, which carry their own timestamp and location.

If a station refuses to record your complaint, that refusal is itself actionable. Ask for the
officer's name and number, and escalate to a superintendent or the equivalent.`,
  },
  {
    title: 'After an incident: looking after yourself',
    category: 'mental-health',
    summary: 'What is normal afterwards, and when to ask for help.',
    content: `In the days after a frightening experience it is normal to feel jumpy, to sleep badly,
to replay it, to feel angry at yourself for what you did or did not do. None of that means you
handled it wrongly. You survived it. That was the task.

Things that genuinely help:

- Tell one person the whole thing, start to finish, out loud. It stops the memory circling.
- Keep the shape of your days. Meals and sleep at the usual times, even when you do not feel like it.
- Move your body. A walk counts.
- Go back to the place with someone you trust, when you are ready. Avoidance makes the map of
  your city smaller and smaller.

Ask for professional help if, after about a month, you are still having flashbacks or nightmares,
avoiding places you used to go, feeling numb or detached, or if you are drinking more than usual.
These are treatable. They respond well to therapy and less well to time alone.

If you are having thoughts of harming yourself, contact a crisis line today. Please do not wait
to see whether it passes.`,
  },
  {
    title: 'Emergency helpline numbers',
    category: 'helpline',
    summary: 'Keep these to hand. Replace them with your own local numbers.',
    isPinned: true,
    contactNumbers: [
      { label: 'National emergency', number: '999' },
      { label: 'Police', number: '100' },
      { label: 'Ambulance', number: '102' },
      { label: 'Fire service', number: '101' },
      { label: "Women's helpline", number: '109' },
      { label: 'Child helpline', number: '1098' },
    ],
    content: `The numbers listed here are placeholders for Bangladesh and India. An administrator
should replace them with the correct numbers for wherever this app is deployed.

Before you need them:

- Save the two you are most likely to call as contacts in your phone, so you are not typing a
  number under stress.
- Learn which number reaches a human fastest where you live. It is not always the one on the
  posters.
- Tell whoever answers three things in this order: where you are, what is happening, whether
  anyone is hurt. Location first. If the call drops, that is the part that mattered.`,
  },
];

async function seedAdmin() {
  /*
   * Matched on the reserved username as well as the email.
   *
   * Looking only at the email meant that changing SEED_ADMIN_EMAIL and
   * re-seeding found nobody, tried to insert a second account with the same
   * hardcoded "admin" username, and died on the unique index - so the one
   * documented way to set the administrator's credentials crashed instead.
   */
  const existing = await User.findOne({
    $or: [{ email: env.seed.adminEmail }, { username: 'admin' }],
  }).select('+password');

  if (existing) {
    const changes = [];

    if (existing.role !== ROLES.ADMIN) {
      existing.role = ROLES.ADMIN;
      changes.push('promoted to administrator');
    }

    // Bring the account in line with whatever .env now says, so editing those
    // two values and re-running this does what it looks like it should.
    if (existing.email !== env.seed.adminEmail) {
      changes.push(`email ${existing.email} -> ${env.seed.adminEmail}`);
      existing.email = env.seed.adminEmail;
    }

    if (!(await existing.comparePassword(env.seed.adminPassword))) {
      existing.password = env.seed.adminPassword; // hashed by the pre-save hook
      changes.push('password reset to SEED_ADMIN_PASSWORD');
    }

    if (changes.length) {
      await existing.save({ validateBeforeSave: false });
      logger.info(`Administrator updated: ${changes.join(', ')}`);
    } else {
      logger.info(`Administrator already exists: ${existing.email}`);
    }

    return existing;
  }

  const admin = await User.create({
    name: 'Nirapod Administrator',
    username: 'admin',
    email: env.seed.adminEmail,
    password: env.seed.adminPassword,
    role: ROLES.ADMIN,
    gender: 'prefer-not-to-say',
  });

  logger.info(`Administrator created: ${admin.email}`);
  logger.warn('Sign in and change the seeded password immediately.');
  return admin;
}

async function seedResources(adminId) {
  let created = 0;

  for (const entry of RESOURCES) {
    const exists = await Resource.findOne({ title: entry.title });
    if (exists) continue;

    await Resource.create({ ...entry, createdBy: adminId, isPublished: true });
    created += 1;
  }

  logger.info(`Safety resources: ${created} created, ${RESOURCES.length - created} already present.`);
}

/** Sample data for demos. Never run against a real deployment. */
/**
 * Sample community data, so the map, the feed and the analytics have something
 * real-shaped in them on a fresh install.
 *
 * The reports are written the way people actually report things - a place you
 * could point to, a time of day, what was seen - and are spread across real
 * Dhaka neighbourhoods with their true coordinates, so the safety map, the
 * radius filters and the admin hotspots all show something meaningful.
 */
async function seedDemo(adminId) {
  const demoUsers = [
    { name: 'Ayesha Rahman', username: 'ayesha', email: 'ayesha@gmail.com', bloodGroup: 'O+' },
    { name: 'Nusrat Jahan', username: 'nusrat', email: 'nusrat@gmail.com', bloodGroup: 'B+' },
    { name: 'Farhana Akter', username: 'farhana', email: 'farhana@gmail.com', bloodGroup: 'A+' },
    { name: 'Tasnim Hossain', username: 'tasnim', email: 'tasnim@gmail.com', bloodGroup: 'AB+' },
    { name: 'Sadia Islam', username: 'sadia', email: 'sadia@gmail.com', bloodGroup: 'O-' },
    { name: 'Sharmin Sultana', username: 'sharmin', email: 'sharmin@gmail.com', bloodGroup: 'B-' },
    { name: 'Jannatul Ferdous', username: 'jannatul', email: 'jannatul@gmail.com', bloodGroup: 'A-' },
    { name: 'Mim Chowdhury', username: 'mim', email: 'mim@gmail.com', bloodGroup: 'O+' },
  ];

  const users = [];
  for (const entry of demoUsers) {
    let user = await User.findOne({ email: entry.email });
    if (!user) {
      user = await User.create({ ...entry, password: 'Demo@12345', gender: 'female' });
    }
    users.push(user);
  }

  // Contacts for the first demo account, so the SOS flow can be shown end to end.
  for (const peer of users.slice(1, 4)) {
    await EmergencyContact.findOneAndUpdate(
      { owner: users[0]._id, email: peer.email },
      {
        owner: users[0]._id,
        name: peer.name,
        email: peer.email,
        relationship: 'Friend',
        priority: 1,
      },
      { upsert: true }
    );
  }

  /*
   * Real neighbourhoods, real coordinates. `hoursAgo` spreads them over the
   * last few weeks so the "reports over time" chart has a shape and the
   * default one-year map window includes all of them.
   */
  const samples = [
    /* ---- stalking ---- */
    {
      title: 'Man followed me from the bus stand to Road 8',
      description:
        'Got off the Shikor bus around 8:30pm and a man in a grey shirt walked behind me for almost ten minutes, ' +
        'crossing the road whenever I did. I went into a pharmacy and waited until he left. Please do not walk that ' +
        'stretch alone after dark.',
      category: 'stalking', severity: 'high', lat: 23.7509, lng: 90.3894, area: 'Dhanmondi', hoursAgo: 14,
    },
    {
      title: 'Same motorcycle circling near the girls hostel',
      description:
        'A black motorcycle with two men has passed the hostel gate repeatedly over the last three evenings, slowing ' +
        'down each time. The guard has noticed it too. Reporting so others keep an eye out.',
      category: 'stalking', severity: 'medium', lat: 23.7333, lng: 90.3927, area: 'Dhaka University', hoursAgo: 62,
    },
    {
      title: 'Followed out of the shopping complex to the CNG stand',
      description:
        'A man waited while I finished shopping and then followed me out to the CNG stand at the corner. I asked the ' +
        'driver to wait until he walked away. Happened around 7pm on a weekday.',
      category: 'stalking', severity: 'high', lat: 23.7509, lng: 90.3730, area: 'Jigatola', hoursAgo: 210,
    },

    /* ---- theft ---- */
    {
      title: 'Phone snatched from a rickshaw at the signal',
      description:
        'Was texting in a rickshaw stopped at the Gulshan 1 signal and someone reached in and took the phone straight ' +
        'out of my hand, then ran into the side lane. Keep your phone down at signals.',
      category: 'theft', severity: 'high', lat: 23.7806, lng: 90.4143, area: 'Gulshan 1', hoursAgo: 30,
    },
    {
      title: 'Bag slashed on a crowded bus near Farmgate',
      description:
        'Someone cut the bottom of my bag on the local bus between Farmgate and Karwan Bazar. Did not notice until I ' +
        'got off and my purse was gone. The bus was very crowded around 6pm.',
      category: 'theft', severity: 'medium', lat: 23.7583, lng: 90.3897, area: 'Farmgate', hoursAgo: 96,
    },
    {
      title: 'Pickpocketing near the New Market gate',
      description:
        'Two people crowded me at the entrance and by the time I got through, my wallet was missing. A shopkeeper ' +
        'said it happens there often in the evening rush.',
      category: 'theft', severity: 'medium', lat: 23.7337, lng: 90.3849, area: 'New Market', hoursAgo: 150,
    },
    {
      title: 'Laptop taken from a parked car in Banani',
      description:
        'Window was broken on a car parked on Road 11 sometime between 2pm and 4pm and the bag on the back seat was ' +
        'taken. Do not leave anything visible inside.',
      category: 'theft', severity: 'medium', lat: 23.7937, lng: 90.4066, area: 'Banani', hoursAgo: 320,
    },

    /* ---- robbery ---- */
    {
      title: 'Attempted bag snatch at the Kalabagan crossing',
      description:
        'Two men on a motorcycle tried to pull my bag as they rode past the crossing. I held on and they let go, but I ' +
        'fell. This was around 9pm. Walk on the inside of the footpath if you can.',
      category: 'robbery', severity: 'critical', lat: 23.7561, lng: 90.3872, area: 'Kalabagan', hoursAgo: 44,
    },
    {
      title: 'Mugged at knifepoint in the lane behind the bazaar',
      description:
        'A man blocked the narrow lane behind the kacha bazar and demanded my phone and money. He showed a knife. I ' +
        'gave everything and he ran. There is no light in that lane at all after 8pm.',
      category: 'robbery', severity: 'critical', lat: 23.7590, lng: 90.3595, area: 'Mohammadpur', hoursAgo: 180,
    },
    {
      title: 'Chain snatched while walking near Mirpur 10',
      description:
        'A motorcycle came from behind and the pillion rider pulled my necklace off as they passed the roundabout. It ' +
        'happened in a second, around 7:45pm.',
      category: 'robbery', severity: 'high', lat: 23.8069, lng: 90.3687, area: 'Mirpur 10', hoursAgo: 260,
    },

    /* ---- harassment ---- */
    {
      title: 'Verbal harassment from a group outside the market',
      description:
        'A group of four men outside the market gate passed comments at every woman walking by. They were still there ' +
        'when I came back an hour later. Reporting so it is on record.',
      category: 'harassment', severity: 'medium', lat: 23.7387, lng: 90.3948, area: 'Shahbagh', hoursAgo: 20,
    },
    {
      title: 'Groping on a crowded local bus',
      description:
        'A man deliberately pressed against me on the bus and would not move when I asked. Two other women said the ' +
        'same thing happened to them on that route. Please use the front seats if they are free.',
      category: 'harassment', severity: 'high', lat: 23.7639, lng: 90.3958, area: 'Tejgaon', hoursAgo: 70,
    },
    {
      title: 'Shopkeeper making comments every time I pass',
      description:
        'A shopkeeper on this stretch comments loudly whenever women walk past, especially students in uniform. Others ' +
        'nearby have started avoiding that side of the road.',
      category: 'harassment', severity: 'low', lat: 23.7284, lng: 90.3854, area: 'Azimpur', hoursAgo: 128,
    },
    {
      title: 'Persistent harassment near the university gate',
      description:
        'Same person waits near the gate at closing time and follows students partway, talking at them. Security has ' +
        'been told but he comes back the next day.',
      category: 'harassment', severity: 'medium', lat: 23.8203, lng: 90.4270, area: 'Bashundhara R/A', hoursAgo: 240,
    },

    /* ---- assault ---- */
    {
      title: 'Woman pushed and hit near the Rampura bridge',
      description:
        'A man grabbed a woman near the bridge after she refused to talk to him and struck her before people pulled ' +
        'him away. She was taken to a clinic nearby. Police were called.',
      category: 'assault', severity: 'critical', lat: 23.7614, lng: 90.4213, area: 'Rampura', hoursAgo: 88,
    },
    {
      title: 'Attacked while walking home in Khilgaon',
      description:
        'Someone came out of a side lane and shoved me hard from behind, then ran when a rickshaw came round the ' +
        'corner. I am not badly hurt. The lane joins the main road just past the school.',
      category: 'assault', severity: 'high', lat: 23.7500, lng: 90.4260, area: 'Khilgaon', hoursAgo: 300,
    },

    /* ---- domestic violence ---- */
    {
      title: 'Repeated shouting and sounds of violence from a flat',
      description:
        'For several weeks there has been shouting and the sound of things breaking from a flat in this building, ' +
        'usually late at night, and a woman crying afterwards. Neighbours are afraid to intervene. Sharing so someone ' +
        'who knows the right helpline can advise.',
      category: 'domestic-violence', severity: 'high', lat: 23.7742, lng: 90.3654, area: 'Shyamoli', hoursAgo: 110,
    },
    {
      title: 'Neighbour asking for help getting out of her home',
      description:
        'A woman in the next house asked for the number of a shelter. She did not want to say more. Posting the ' +
        'national helpline in the comments in case anyone else nearby needs it.',
      category: 'domestic-violence', severity: 'high', lat: 23.7186, lng: 90.4204, area: 'Wari', hoursAgo: 350,
    },

    /* ---- suspicious person ---- */
    {
      title: 'Group loitering near the campus gate after dark',
      description:
        'Four or five men gather by the gate after 9pm most nights, drinking and calling out to people who pass. The ' +
        'guard says they leave if asked but come back.',
      category: 'suspicious-person', severity: 'low', lat: 23.7330, lng: 90.3927, area: 'Dhaka University', hoursAgo: 52,
    },
    {
      title: 'Man photographing women at the bus counter',
      description:
        'Noticed a man holding his phone up towards the queue at the counter for a long time. When I looked at him he ' +
        'put it away and left. Staff at the counter have been told.',
      category: 'suspicious-person', severity: 'medium', lat: 23.8759, lng: 90.3795, area: 'Uttara Sector 7', hoursAgo: 190,
    },
    {
      title: 'Someone trying door handles in the building at night',
      description:
        'The caretaker found a man on the third floor around 1am trying handles. He ran down the stairs when ' +
        'challenged. The building has no CCTV on that side.',
      category: 'suspicious-person', severity: 'medium', lat: 23.7796, lng: 90.3597, area: 'Kallyanpur', hoursAgo: 400,
    },

    /* ---- unsafe area ---- */
    {
      title: 'Street lights out along the lake road',
      description:
        'The whole stretch beside the lake has been dark for over two weeks. It is a common walking route in the ' +
        'evening and there is no other footpath. Reported to the city office already.',
      category: 'unsafe-area', severity: 'medium', lat: 23.7461, lng: 90.3742, area: 'Dhanmondi', hoursAgo: 36,
    },
    {
      title: 'Underpass with no lighting and no guard',
      description:
        'The underpass is completely dark after sunset and the guard post has been empty for months. People are ' +
        'crossing the main road instead, which is its own danger.',
      category: 'unsafe-area', severity: 'high', lat: 23.7330, lng: 90.4172, area: 'Motijheel', hoursAgo: 168,
    },
    {
      title: 'Broken footpath forcing people onto the highway edge',
      description:
        'A long section of footpath has collapsed and everyone is walking on the road with buses passing close. Bad ' +
        'in daylight, worse at night.',
      category: 'unsafe-area', severity: 'high', lat: 23.7104, lng: 90.4348, area: 'Jatrabari', hoursAgo: 280,
    },
    {
      title: 'Abandoned construction site being used after dark',
      description:
        'An unfenced construction site next to the road has people gathering inside it at night. There is no lighting ' +
        'and the footpath runs right past the opening.',
      category: 'unsafe-area', severity: 'medium', lat: 23.7414, lng: 90.4290, area: 'Mugda', hoursAgo: 420,
    },

    /* ---- other ---- */
    {
      title: 'Rideshare driver refused to follow the app route',
      description:
        'The driver turned off the main road and would not explain where he was going. I asked him to stop, got out ' +
        'near a shop and reported the trip. Always share your ride with someone.',
      category: 'other', severity: 'high', lat: 23.7806, lng: 90.4267, area: 'Badda', hoursAgo: 58,
    },
    {
      title: 'Unlicensed CNG refusing to use the meter at night',
      description:
        'Several drivers at this stand refuse the meter after 9pm and get aggressive when asked. One followed a ' +
        'passenger down the road arguing after she got out.',
      category: 'other', severity: 'low', lat: 23.7500, lng: 90.4130, area: 'Malibagh', hoursAgo: 340,
    },
  ];

  let createdIncidents = 0;
  const created = [];

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];

    const existing = await Incident.findOne({ title: sample.title });
    if (existing) {
      created.push(existing);
      continue;
    }

    // Every third report is verified, so the feed shows both states.
    const verified = i % 3 === 0;

    const incident = await Incident.create({
      reporter: users[i % users.length]._id,
      title: sample.title,
      description: sample.description,
      category: sample.category,
      severity: sample.severity,
      location: { type: 'Point', coordinates: [sample.lng, sample.lat] },
      area: sample.area,
      city: 'Dhaka',
      occurredAt: new Date(Date.now() - sample.hoursAgo * 60 * 60 * 1000),
      status: verified ? INCIDENT_STATUS.VERIFIED : INCIDENT_STATUS.PENDING,
      verifiedBy: verified ? adminId : null,
      verifiedAt: verified ? new Date() : null,
    });

    created.push(incident);
    createdIncidents += 1;
  }

  /*
   * A few reactions and replies. Without them every report shows zero of
   * everything, and the "helpful" ordering and the comment thread look broken
   * rather than simply empty.
   */
  const replies = [
    'This happened to me on the same road last month. Thank you for posting it.',
    'Reported the lighting to the ward office as well. They said two weeks.',
    'I walk here every evening. Will take the longer route past the main gate from now on.',
    'The national helpline is 109. They can arrange a shelter and legal help.',
    'Was there yesterday and it is still like this. Nothing has changed.',
    'Please be careful, this is exactly where my sister was followed.',
  ];

  let createdComments = 0;
  for (let i = 0; i < created.length; i += 1) {
    const incident = created[i];
    if (i % 3 !== 0) continue;

    const author = users[(i + 2) % users.length];
    const body = replies[i % replies.length];

    const already = await Comment.findOne({ incident: incident._id, author: author._id });
    if (already) continue;

    await Comment.create({ incident: incident._id, author: author._id, body });
    await Incident.updateOne({ _id: incident._id }, { $inc: { commentCount: 1 } });
    createdComments += 1;
  }

  // Spread reactions so the counts differ between reports.
  for (let i = 0; i < created.length; i += 1) {
    const incident = created[i];
    if (incident.reactions?.length) continue;

    const kinds = ['helpful', 'important', 'support'];
    const reactions = [];
    for (let j = 0; j <= i % 4; j += 1) {
      const user = users[(i + j) % users.length];
      if (String(user._id) === String(incident.reporter)) continue;
      reactions.push({ user: user._id, type: kinds[(i + j) % kinds.length] });
    }

    if (reactions.length) {
      // Saved as a document, not updateOne, so the denormalised reactionCounts
      // the feed reads are recomputed rather than left at zero.
      incident.reactions = reactions;
      incident.recalculateReactionCounts();
      await incident.save();
    }
  }

  logger.info(
    `Demo data: ${users.length} users, ${createdIncidents} new incidents ` +
      `(${created.length} total), ${createdComments} comments.`
  );
  logger.info('Demo accounts sign in with the password: Demo@12345');
}

async function run() {
  const withDemo = process.argv.includes('--demo');

  await connectDatabase();
  logger.info('Building indexes...');
  await Promise.all(
    Object.values(mongoose.models).map((model) =>
      model.createIndexes().catch((error) => {
        logger.warn(`Index build failed for ${model.modelName}`, { message: error.message });
      })
    )
  );

  const admin = await seedAdmin();
  await seedResources(admin._id);
  if (withDemo) await seedDemo(admin._id);

  logger.info('Seed complete.');
  await disconnectDatabase();
  process.exit(0);
}

run().catch(async (error) => {
  logger.error('Seed failed', error);
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
