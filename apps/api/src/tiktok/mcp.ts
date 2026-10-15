import type { McpScope } from '../mcp/server';

// The TikTok MCP endpoint. The TikTok agent in Hermes connects with the API key
// of its external agent in Vexol; that agent's role decides what it may do.
const INSTRUCTIONS = `
You make animated TikTok videos for a Vexol project and post them through its
Buffer account. A person gives you the task in the Vexol dashboard. Every tool
takes the projectKey of the project.

1. list_tiktok_templates shows the prompt library: each template has a prompt,
   hex colors, a style and a duration. Use the template the person names, and
   keep to its colors and style.
2. create_tiktok_draft records the video you are making (from a templateId or
   your own prompt), with its caption. Render the video yourself, then call
   update_tiktok_draft with videoUrl: a public https URL of the finished file.
3. list_tiktok_channels shows the TikTok accounts connected in Buffer.
   publish_tiktok_draft sends the video and caption of a draft: mode "now" posts
   at once, mode "schedule" needs scheduledFor as an ISO date-time with a time
   zone offset. Send a new random UUID as idempotencyKey for every new post, and
   the same key again only when you retry that same post.
4. list_tiktok_posts and refresh_tiktok_post show the status Buffer reports.

Post only what the person asked for. When the video, the account or the time is
unclear, ask before you post. Report the status the tool returned: never say a
video was posted or scheduled unless the post status says so. When a call fails,
report the error; do not post the video again in another way.
`.trim();

export const tiktokMcpScope: McpScope = { server: 'tiktok-agent', instructions: INSTRUCTIONS };
