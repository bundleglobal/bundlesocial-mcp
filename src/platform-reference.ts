import { COMMENT_PLATFORMS, type Platform, PLATFORMS } from "./platforms";

/**
 * Structured per-platform field reference for the `data.<PLATFORM>` objects the
 * bundle.social API accepts. Exposed to MCP clients via the `describe_platform`
 * tool so an agent can look up exactly which fields a platform needs without
 * guessing or relying on stale training data.
 *
 * SYNC: the field tables here mirror bundlesocial-cli/PROVIDER_SETTINGS.md and
 * https://docs.bundle.social/api-reference/platform-parameters — when the API
 * gains/removes/changes a `data.<PLATFORM>` field, update all three.
 */

export interface ReferenceField {
  /** Field name as it appears under `data.<PLATFORM>`. */
  name: string;
  /** Human-readable type, e.g. `string`, `string[]`, an enum union, or an object shape. */
  type: string;
  /** Whether the platform requires this field for a post/comment to succeed. */
  required: boolean;
  /** What the field does and any limits/caveats. */
  notes: string;
}

export interface OperationReference {
  /** Where the object lives in the request body, e.g. `data.REDDIT`. */
  dataKey: string;
  /** One-line description of the operation for this platform. */
  summary: string;
  /** Every field the operation accepts for this platform. */
  fields: ReferenceField[];
  /** A minimal, valid example object for this platform. */
  example: Record<string, unknown>;
}

export interface PlatformReferenceEntry {
  platform: Platform;
  /** Display name, e.g. `X / Twitter`. */
  label: string;
  /** Accepted names/aliases (lower-cased) for this platform. */
  aliases: string[];
  capabilities: {
    /** Can create/schedule posts. */
    posting: boolean;
    /** Can create comments/replies on a post. */
    comments: boolean;
    /** Exposes post & account analytics. */
    analytics: boolean;
    /** Supports importing the (incoming) comments on a published post. */
    commentImports: boolean;
  };
  /** The `data.<PLATFORM>` schema used by create_post / schedule_post / update_post. */
  post: OperationReference;
  /** The `data.<PLATFORM>` schema used by create_comment / update_comment (omitted when unsupported). */
  comment?: OperationReference;
  /** Extra platform-specific guidance. */
  notes: string[];
}

const COMMENT_IMPORT_PLATFORMS: Platform[] = [
  "FACEBOOK",
  "INSTAGRAM",
  "LINKEDIN",
  "YOUTUBE",
  "TIKTOK",
  "REDDIT",
  "THREADS",
  "MASTODON",
  "BLUESKY",
];

const ANALYTICS: Platform[] = [
  "TIKTOK",
  "YOUTUBE",
  "INSTAGRAM",
  "FACEBOOK",
  "THREADS",
  "REDDIT",
  "PINTEREST",
  "MASTODON",
  "LINKEDIN",
  "BLUESKY",
  "GOOGLE_BUSINESS",
  "SNAPCHAT",
];

/** A comment's `data.<PLATFORM>` only ever carries the comment body text. */
function commentOperation(platform: Platform): OperationReference {
  return {
    dataKey: `data.${platform}`,
    summary: `Comment/reply on a post. The per-platform comment object only carries the comment body.`,
    fields: [{ name: "text", type: "string", required: true, notes: "The comment body." }],
    example: { [platform]: { text: "Great write-up — thanks for sharing!" } },
  };
}

/** Per-platform post-field tables. Keyed by platform; comment data is added below. */
const POST: Record<Platform, OperationReference> = {
  TWITTER: {
    dataKey: "data.TWITTER",
    summary: "Post a tweet. For a thread, post the first tweet then add replies via create_comment.",
    fields: [
      { name: "text", type: "string", required: false, notes: "Post text. ~280 chars (longer if the connected account is X Premium)." },
      { name: "uploadIds", type: "string[]", required: false, notes: "Up to 4 images OR 1 video/GIF." },
      {
        name: "replySettings",
        type: "EVERYONE | FOLLOWING | MENTIONED_USERS | SUBSCRIBERS | VERIFIED",
        required: false,
        notes: "Who can reply to the tweet.",
      },
      { name: "isAiGenerated", type: "boolean", required: false, notes: 'Adds X\'s "made with AI" label to a post with AI-generated media.' },
    ],
    example: { TWITTER: { text: "Shipping day 🚀", replySettings: "EVERYONE" } },
  },
  BLUESKY: {
    dataKey: "data.BLUESKY",
    summary: "Post to Bluesky.",
    fields: [
      { name: "text", type: "string", required: false, notes: "~300 chars." },
      { name: "uploadIds", type: "string[]", required: false, notes: "Up to 4 images, or 1 video (set videoAlt)." },
      { name: "tags", type: "string[]", required: false, notes: "Extra hashtags (without `#`), up to 8." },
      {
        name: "labels",
        type: "(!no-unauthenticated | porn | sexual | nudity | graphic-media)[]",
        required: false,
        notes: "Self-labels / content warnings.",
      },
      { name: "quoteUri", type: "string", required: false, notes: "AT-URI of a post to quote (at://…/app.bsky.feed.post/<rkey>)." },
      { name: "externalUrl", type: "string (URL)", required: false, notes: "External link card URL." },
      { name: "externalTitle", type: "string", required: false, notes: "External link card title." },
      { name: "externalDescription", type: "string", required: false, notes: "External link card description." },
      { name: "thumbnail", type: "string (URL)", required: false, notes: "Image for the external link card (a public bundle.social upload URL)." },
      { name: "videoAlt", type: "string", required: false, notes: "Alt text for a video embed." },
    ],
    example: { BLUESKY: { text: "New post", tags: ["launch", "indie"], externalUrl: "https://bundle.social" } },
  },
  MASTODON: {
    dataKey: "data.MASTODON",
    summary: "Post a status to Mastodon.",
    fields: [
      { name: "text", type: "string", required: false, notes: "Length depends on the connected instance (commonly ~500)." },
      { name: "uploadIds", type: "string[]", required: false, notes: "Up to 4 images OR 1 video." },
      { name: "privacy", type: "PUBLIC | UNLISTED | PRIVATE | DIRECT", required: false, notes: "Visibility." },
      { name: "spoiler", type: "string", required: false, notes: "Content-warning text (collapses the post behind it)." },
      { name: "thumbnail", type: "string (URL)", required: false, notes: "Cover image for a video." },
    ],
    example: { MASTODON: { text: "Hello fediverse", privacy: "PUBLIC", spoiler: "long read" } },
  },
  THREADS: {
    dataKey: "data.THREADS",
    summary: "Post to Threads.",
    fields: [
      { name: "text", type: "string", required: false, notes: "~500 chars." },
      { name: "uploadIds", type: "string[]", required: false, notes: "Up to ~10 images, or 1 video." },
      {
        name: "mediaItems",
        type: "{ uploadId: string, altText?: string }[]",
        required: false,
        notes: "Per-image alt text (alternative to uploadIds).",
      },
      {
        name: "topicTag",
        type: "string",
        required: false,
        notes: "One topic tag shown in the post header. 1–50 chars, no periods (.) or ampersands (&).",
      },
      {
        name: "replyControl",
        type: "everyone | accounts_you_follow | mentioned_only | parent_post_author_only | followers_only",
        required: false,
        notes: "Who can reply. Threads defaults to everyone.",
      },
      {
        name: "linkAttachment",
        type: "string (URL)",
        required: false,
        notes: "Link preview card. Text-only posts (no uploadIds).",
      },
      {
        name: "poll",
        type: "{ optionA: string, optionB: string, optionC?: string, optionD?: string }",
        required: false,
        notes: "2–4 options, 1–25 chars each. Text-only posts, and not together with `gif`.",
      },
      {
        name: "gif",
        type: '{ gifId: string, provider?: "GIPHY" }',
        required: false,
        notes: "GIF attachment (GIPHY is the only provider). Text-only posts, and not together with `poll`.",
      },
      {
        name: "allowlistedCountryCodes",
        type: "string[]",
        required: false,
        notes: "Restrict visibility to these ISO 3166-1 alpha-2 codes. Requires Meta account eligibility.",
      },
      {
        name: "crosspostToInstagramStory",
        type: "boolean",
        required: false,
        notes: "Also share the post to the linked Instagram account as a Story.",
      },
      {
        name: "crosspostToInstagramStoryDarkMode",
        type: "boolean",
        required: false,
        notes: "Cross-post the Instagram Story in dark mode.",
      },
    ],
    example: { THREADS: { text: "Quick thought", topicTag: "shipping", replyControl: "everyone" } },
  },
  LINKEDIN: {
    dataKey: "data.LINKEDIN",
    summary: "Post to a LinkedIn personal profile or company page (depends on the connected account).",
    fields: [
      { name: "text", type: "string", required: true, notes: "Required. ~3000 chars." },
      { name: "uploadIds", type: "string[]", required: false, notes: "Images, a single video, or a document/PDF." },
      { name: "link", type: "string (URL)", required: false, notes: "For an article-preview post." },
      { name: "thumbnail", type: "string (URL)", required: false, notes: "Cover image (a public bundle.social upload URL)." },
      { name: "mediaTitle", type: "string", required: false, notes: "Title for a video or document post." },
      { name: "privacy", type: "CONNECTIONS | PUBLIC | LOGGED_IN | CONTAINER", required: false, notes: "Visibility." },
      { name: "hideFromFeed", type: "boolean", required: false, notes: "Don't show in the main feed." },
      { name: "disableReshare", type: "boolean", required: false, notes: "Disallow resharing." },
    ],
    example: { LINKEDIN: { text: "We just shipped X.", privacy: "PUBLIC", mediaTitle: "Demo" } },
  },
  FACEBOOK: {
    dataKey: "data.FACEBOOK",
    summary: "Post to a Facebook Page.",
    fields: [
      { name: "type", type: "POST | REEL | STORY", required: false, notes: "Default POST." },
      { name: "text", type: "string", required: false, notes: "Caption / message." },
      { name: "uploadIds", type: "string[]", required: false, notes: "Images, or a single video." },
      { name: "mediaItems", type: "{ uploadId: string, altText?: string }[]", required: false, notes: "Per-image alt text." },
      { name: "link", type: "string (URL)", required: false, notes: "Link attachment — `type: POST` only." },
      { name: "mediaTitle", type: "string", required: false, notes: "Video title — `type: POST` with a video only (not REEL/STORY)." },
      { name: "thumbnail", type: "string (URL)", required: false, notes: "Video cover image." },
      {
        name: "nativeScheduleTime",
        type: "string (ISO 8601, local)",
        required: false,
        notes: "Schedule directly in Meta's scheduler instead of publishing now; max 30 days ahead.",
      },
    ],
    example: { FACEBOOK: { type: "POST", text: "Look at this", link: "https://bundle.social" } },
  },
  INSTAGRAM: {
    dataKey: "data.INSTAGRAM",
    summary: "Post to Instagram (feed post, carousel, Reel or Story).",
    fields: [
      {
        name: "type",
        type: "POST | REEL | STORY",
        required: false,
        notes: "POST = single image, carousel (carouselItems) or feed video; REEL = single video; STORY = image or short video.",
      },
      { name: "text", type: "string", required: false, notes: "Caption." },
      {
        name: "uploadIds",
        type: "string[]",
        required: false,
        notes: "Single image/video for POST/REEL/STORY. Square ≥1080×1080 or portrait 4:5; Reels 9:16, up to 90s.",
      },
      { name: "altText", type: "string", required: false, notes: "Alt text for a single-image post." },
      {
        name: "carouselItems",
        type: "{ uploadId: string, altText?: string, tagged?: { username, x, y }[] }[]",
        required: false,
        notes: "Carousel slides (for `type: POST`).",
      },
      { name: "thumbnailOffset", type: "number (ms)", required: false, notes: "Frame to use as the published video's cover." },
      { name: "thumbnail", type: "string (URL)", required: false, notes: "Cover image (alternative to thumbnailOffset)." },
      { name: "shareToFeed", type: "boolean", required: false, notes: "Reels only — also show in the Feed tab." },
      { name: "collaborators", type: "string[]", required: false, notes: "Usernames to invite as collaborators." },
      { name: "tagged", type: "{ username: string, x?: number, y?: number }[]", required: false, notes: "People tags for a single-image post." },
      {
        name: "locationId",
        type: "string",
        required: false,
        notes: 'A location id — discover with trigger_integration_tool method "instagram:locations".',
      },
      { name: "autoFitImage", type: "boolean", required: false, notes: "Let bundle.social fit the image to a valid aspect ratio." },
      { name: "autoCropImage", type: "boolean", required: false, notes: "Let bundle.social crop the image to a valid aspect ratio." },
      {
        name: "trialParams",
        type: '{ graduationStrategy: "MANUAL" | "SS_PERFORMANCE" }',
        required: false,
        notes: "Reels only — trial reels are shown to non-followers first.",
      },
      {
        name: "isPaidPartnership",
        type: "boolean",
        required: false,
        notes: 'Adds the native "Paid partnership" label. Implied by brandedContentSponsors; use alone for a label without a named sponsor.',
      },
      {
        name: "brandedContentSponsors",
        type: "string[]",
        required: false,
        notes: "Up to 2 Instagram usernames to tag as paid-partnership sponsors. Accounts connected via Facebook Login only.",
      },
      {
        name: "musicSoundInfo",
        type: "{ musicSoundId, musicSoundVolume?, videoOriginalSoundVolume? }",
        required: false,
        notes: 'Reels only — get an audio_id from trigger_integration_tool method "instagram:audio". Volumes 0–100.',
      },
      { name: "isAiGenerated", type: "boolean", required: false, notes: "Adds Instagram's AI content label." },
    ],
    example: { INSTAGRAM: { type: "REEL", text: "BTS", shareToFeed: true, thumbnailOffset: 1500 } },
  },
  TIKTOK: {
    dataKey: "data.TIKTOK",
    summary: "Post a video or photo carousel to TikTok.",
    fields: [
      { name: "type", type: "VIDEO | IMAGE", required: false, notes: "VIDEO = 1 video; IMAGE = photo carousel." },
      {
        name: "privacy",
        type: "PUBLIC_TO_EVERYONE | MUTUAL_FOLLOW_FRIENDS | FOLLOWER_OF_CREATOR | SELF_ONLY",
        required: true,
        notes: "Effectively required by TikTok.",
      },
      { name: "text", type: "string", required: false, notes: "Caption." },
      {
        name: "uploadIds",
        type: "string[]",
        required: false,
        notes: "The video, or the photos for `type: IMAGE`. Video: MP4/MOV/WEBM, ≥540p, portrait 9:16 recommended, up to ~10 min.",
      },
      { name: "photoCoverIndex", type: "number", required: false, notes: "Which photo is the cover (for `type: IMAGE`)." },
      { name: "thumbnailOffset", type: "number (ms)", required: false, notes: "Frame to use as the video cover." },
      { name: "thumbnail", type: "string (URL)", required: false, notes: "Cover image (alternative to thumbnailOffset)." },
      { name: "isBrandContent", type: "boolean", required: false, notes: "Disclosure: paid third-party partnership." },
      { name: "isOrganicBrandContent", type: "boolean", required: false, notes: "Disclosure: promoting your own business." },
      { name: "disableComments", type: "boolean", required: false, notes: "Interaction restriction." },
      { name: "disableDuet", type: "boolean", required: false, notes: "Interaction restriction." },
      { name: "disableStitch", type: "boolean", required: false, notes: "Interaction restriction." },
      { name: "isAiGenerated", type: "boolean", required: false, notes: "Mark the video as AI-generated." },
      { name: "autoAddMusic", type: "boolean", required: false, notes: "Let TikTok add music to photos." },
      { name: "autoScale", type: "boolean", required: false, notes: "Auto-scale the video." },
      { name: "uploadToDraft", type: "boolean", required: false, notes: "Upload as a TikTok draft instead of publishing." },
      {
        name: "musicSoundInfo",
        type: "{ musicSoundId, musicSoundVolume?, musicSoundStart?, musicSoundEnd?, videoOriginalSoundVolume? }",
        required: false,
        notes:
          'Commercial music — get a song_clip_id from trigger_integration_tool method "tiktok:trending-music". Volumes 0–100; start/end in ms.',
      },
    ],
    example: { TIKTOK: { type: "VIDEO", text: "Launch BTS", privacy: "PUBLIC_TO_EVERYONE", disableStitch: true } },
  },
  YOUTUBE: {
    dataKey: "data.YOUTUBE",
    summary: "Upload a video or Short to YouTube.",
    fields: [
      { name: "type", type: "VIDEO | SHORT", required: false, notes: "SHORT = vertical ≤60s; VIDEO = full upload." },
      { name: "uploadIds", type: "string[]", required: false, notes: "One video." },
      { name: "text", type: "string", required: false, notes: "The video TITLE (the post `title` field also maps here)." },
      { name: "description", type: "string", required: false, notes: "Video description." },
      { name: "thumbnail", type: "string (URL)", required: false, notes: "Custom thumbnail (`type: VIDEO`)." },
      { name: "privacy", type: "PUBLIC | UNLISTED | PRIVATE", required: false, notes: "Visibility." },
      {
        name: "defaultLanguage",
        type: "string (BCP-47)",
        required: false,
        notes: 'Language of the title and description, e.g. "en" or "pl".',
      },
      {
        name: "defaultAudioLanguage",
        type: "string (BCP-47)",
        required: false,
        notes: 'Language of the video\'s default audio track, e.g. "en" or "pl".',
      },
      { name: "madeForKids", type: "boolean", required: true, notes: "Required-ish — YouTube needs you to declare this." },
      { name: "containsSyntheticMedia", type: "boolean", required: false, notes: "Mark AI-generated content." },
      { name: "hasPaidProductPlacement", type: "boolean", required: false, notes: "Declare paid placements." },
    ],
    example: { YOUTUBE: { type: "SHORT", text: "Launch BTS", description: "Behind the scenes…", privacy: "PUBLIC", madeForKids: false } },
  },
  REDDIT: {
    dataKey: "data.REDDIT",
    summary: "Submit a post to a subreddit (or your profile).",
    fields: [
      { name: "sr", type: "string", required: true, notes: "Subreddit (`r/subredditName`) or `u/username`." },
      { name: "text", type: "string", required: true, notes: "The post title for link/text posts (Reddit's \"title\")." },
      { name: "description", type: "string", required: false, notes: "The body for a self post." },
      { name: "uploadIds", type: "string[]", required: false, notes: "An image or video." },
      { name: "link", type: "string (URL)", required: false, notes: "Link post target." },
      { name: "nsfw", type: "boolean", required: false, notes: "Mark NSFW." },
      {
        name: "flairId",
        type: "string",
        required: false,
        notes: 'Required if the subreddit requires a flair — get options with trigger_integration_tool method "reddit:flairs".',
      },
    ],
    example: { REDDIT: { sr: "r/dataisbeautiful", text: "Our 2026 growth, visualized", uploadIds: ["<id>"], flairId: "<flair-id>" } },
  },
  DISCORD: {
    dataKey: "data.DISCORD",
    summary: "Post a message to a connected Discord channel.",
    fields: [
      { name: "channelId", type: "string", required: true, notes: "The connected server channel (an integration \"channel\" id — see list_integrations)." },
      { name: "text", type: "string", required: false, notes: "Message content. ≤2000 chars." },
      { name: "uploadIds", type: "string[]", required: false, notes: "Attachments." },
      { name: "username", type: "string", required: false, notes: "Override the author name shown (webhook)." },
      { name: "avatarUrl", type: "string (URL)", required: false, notes: "Override the author avatar (webhook)." },
    ],
    example: { DISCORD: { channelId: "<channel-id>", text: "New release 🎉" } },
  },
  SLACK: {
    dataKey: "data.SLACK",
    summary: "Post a message to a connected Slack channel.",
    fields: [
      { name: "channelId", type: "string", required: true, notes: "The connected workspace channel (an integration \"channel\" id — see list_integrations)." },
      { name: "text", type: "string", required: false, notes: "Message text." },
      { name: "uploadIds", type: "string[]", required: false, notes: "Attachments." },
      { name: "username", type: "string", required: false, notes: "Override the author name shown." },
      { name: "avatarUrl", type: "string (URL)", required: false, notes: "Override the author avatar." },
    ],
    example: { SLACK: { channelId: "<channel-id>", text: "Standup notes…" } },
  },
  GOOGLE_BUSINESS: {
    dataKey: "data.GOOGLE_BUSINESS",
    summary: "Publish an update to a Google Business Profile location.",
    fields: [
      { name: "text", type: "string", required: false, notes: "The update body." },
      { name: "uploadIds", type: "string[]", required: false, notes: "Images/videos." },
      { name: "topicType", type: "STANDARD | EVENT | OFFER | ALERT", required: false, notes: "Post kind." },
      { name: "languageCode", type: "string", required: false, notes: "Language tag like `en` / `en-US`." },
      {
        name: "callToActionType",
        type: "BOOK | ORDER | SHOP | LEARN_MORE | SIGN_UP | CALL",
        required: false,
        notes: "CTA button.",
      },
      { name: "callToActionUrl", type: "string (URL)", required: false, notes: "CTA target." },
      { name: "eventTitle", type: "string", required: false, notes: "For `topicType: EVENT`." },
      { name: "eventStartDate", type: "string", required: false, notes: "For `topicType: EVENT`." },
      { name: "eventEndDate", type: "string", required: false, notes: "For `topicType: EVENT`." },
      { name: "offerCouponCode", type: "string", required: false, notes: "For `topicType: OFFER`." },
      { name: "offerRedeemOnlineUrl", type: "string", required: false, notes: "For `topicType: OFFER`." },
      { name: "offerTermsConditions", type: "string", required: false, notes: "For `topicType: OFFER`." },
      { name: "alertType", type: "COVID_19", required: false, notes: "For `topicType: ALERT`." },
    ],
    example: {
      GOOGLE_BUSINESS: { text: "Now open Saturdays!", topicType: "STANDARD", callToActionType: "LEARN_MORE", callToActionUrl: "https://example.com" },
    },
  },
  PINTEREST: {
    dataKey: "data.PINTEREST",
    summary: "Create a Pin on a board.",
    fields: [
      { name: "boardName", type: "string", required: true, notes: "The board to pin to." },
      { name: "uploadIds", type: "string[]", required: false, notes: "One image (or video)." },
      { name: "text", type: "string", required: false, notes: "The Pin title." },
      { name: "description", type: "string", required: false, notes: "Pin description." },
      { name: "link", type: "string (URL)", required: false, notes: "Where the Pin links to." },
      { name: "altText", type: "string", required: false, notes: "Image alt text." },
      { name: "note", type: "string", required: false, notes: "Private note (not public)." },
      { name: "thumbnail", type: "string (URL)", required: false, notes: "Cover image." },
      { name: "dominantColor", type: "string", required: false, notes: "Hex color used as a placeholder before the image loads." },
      { name: "isAiGenerated", type: "boolean", required: false, notes: "Adds Pinterest's AI disclosure label." },
    ],
    example: { PINTEREST: { boardName: "Inspiration", text: "New idea", uploadIds: ["<id>"], link: "https://bundle.social" } },
  },
  SNAPCHAT: {
    dataKey: "data.SNAPCHAT",
    summary: "Post a Story or a Spotlight to a Snapchat Public Profile.",
    fields: [
      { name: "type", type: "STORY | SPOTLIGHT", required: false, notes: "Default STORY." },
      {
        name: "uploadIds",
        type: "string[]",
        required: false,
        notes: "One image or video. Video: 5–180s, ≥540×960, up to 100 MB. Images are Story-only.",
      },
      { name: "text", type: "string", required: false, notes: "Alias for `description` (Spotlight). ≤160 chars." },
      { name: "description", type: "string", required: false, notes: "Spotlight description. ≤160 chars." },
      { name: "locale", type: "string", required: false, notes: "Spotlight locale in `en_US` form. Default en_US." },
      { name: "skipSaveToProfile", type: "boolean", required: false, notes: "Spotlight only — don't save the post to the profile." },
    ],
    example: { SNAPCHAT: { type: "SPOTLIGHT", description: "Launch day", locale: "en_US" } },
  },
};

const ALIASES_BY_PLATFORM: Record<Platform, string[]> = {
  TWITTER: ["x", "twitter"],
  BLUESKY: ["bluesky", "bsky"],
  MASTODON: ["mastodon", "masto"],
  THREADS: ["threads"],
  LINKEDIN: ["linkedin", "li"],
  FACEBOOK: ["facebook", "fb"],
  INSTAGRAM: ["instagram", "ig", "insta"],
  TIKTOK: ["tiktok", "tt"],
  YOUTUBE: ["youtube", "yt"],
  REDDIT: ["reddit"],
  DISCORD: ["discord"],
  SLACK: ["slack"],
  GOOGLE_BUSINESS: ["gbp", "google-business", "google_business", "gmb"],
  PINTEREST: ["pinterest", "pin"],
  SNAPCHAT: ["snapchat", "snap"],
};

const LABELS: Record<Platform, string> = {
  TWITTER: "X / Twitter",
  BLUESKY: "Bluesky",
  MASTODON: "Mastodon",
  THREADS: "Threads",
  LINKEDIN: "LinkedIn",
  FACEBOOK: "Facebook (Page)",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  REDDIT: "Reddit",
  DISCORD: "Discord",
  SLACK: "Slack",
  GOOGLE_BUSINESS: "Google Business Profile",
  PINTEREST: "Pinterest",
  SNAPCHAT: "Snapchat (Public Profile)",
};

const NOTES: Partial<Record<Platform, string[]>> = {
  TWITTER: [
    "For an X thread, post the first tweet, then add the rest as replies — note the API does not expose comments for X, so chain them as separate posts.",
    "No analytics surface for X.",
  ],
  LINKEDIN: ['Discover mention URNs with trigger_integration_tool method "linkedin:mentions" and put them in `text`.'],
  REDDIT: [
    'Before posting, run trigger_integration_tool method "reddit:requirements" to learn title length limits, allowed post types and whether a flair is required.',
  ],
  YOUTUBE: [
    'There is no `categoryId` in the post `data`; fetch categories with trigger_integration_tool method "youtube:categories".',
  ],
  INSTAGRAM: [
    "Account types are connected via Facebook or directly via Instagram (instagramConnectionMethod on the integration).",
    "brandedContentSponsors and business discovery only work for accounts connected through Facebook Login.",
  ],
  GOOGLE_BUSINESS: ["Set the location up in the dashboard first; details/categories/hours are managed via integration helper tools."],
  SNAPCHAT: [
    "Requires a Snapchat Public Profile. Stories take an image or a video; Spotlights are video-only.",
    "No comments API surface for Snapchat.",
  ],
  THREADS: ["Polls, GIFs and link attachments are mutually exclusive with media — Threads only allows them on text-only posts."],
};

/** General media guidance that applies to every platform's `uploadIds`. */
export const MEDIA_NOTES: string[] = [
  "Images: JPG / PNG / WEBP / GIF. Video: MP4 / MOV / WEBM, up to 5 GB via the large-upload flow.",
  "Upload media first (upload_media → id), or let create_post's `media` arg do it; then put ids in `uploadIds` (and carouselItems[].uploadId / mediaItems[].uploadId).",
  "Large videos can take a while to process server-side after upload — a newly created post may sit in PROCESSING before going POSTED. Use get_post to check status; retry_post for a transient platform failure.",
];

/** The full per-platform reference, one entry per supported platform. */
export const PLATFORM_REFERENCE: Record<Platform, PlatformReferenceEntry> = Object.fromEntries(
  PLATFORMS.map((platform) => {
    const supportsComments = (COMMENT_PLATFORMS as readonly string[]).includes(platform);
    const entry: PlatformReferenceEntry = {
      platform,
      label: LABELS[platform],
      aliases: ALIASES_BY_PLATFORM[platform],
      capabilities: {
        posting: true,
        comments: supportsComments,
        analytics: ANALYTICS.includes(platform),
        commentImports: COMMENT_IMPORT_PLATFORMS.includes(platform),
      },
      post: POST[platform],
      ...(supportsComments ? { comment: commentOperation(platform) } : {}),
      notes: NOTES[platform] ?? [],
    };
    return [platform, entry];
  }),
) as Record<Platform, PlatformReferenceEntry>;
