# Studio and Vera

Vera makes social media posts from the six Studio templates. A person reviews them on
the **Vera's posts** tab and schedules them through Zernio.

## How a post is made

Vera works through the MCP server (`POST <API_URL>/mcp`), authenticated with the API key
of her external agent. The Studio tools she uses:

- `list_studio_templates`: the templates and what each is for.
- `create_studio_post`: edits a template photo with an instruction into a new image
  (OpenRouter, up to two minutes).
- `create_studio_draft`: the caption plus that image, as a draft.
- `list_studio_drafts`, `get_studio_draft`, `update_studio_draft`,
  `request_studio_draft_review`.

Reviewing and scheduling are routes for people only; an agent gets `403`.

## Scheduling

Scheduling sends the approved version to Zernio (`POST /v1/posts`) with the chosen
accounts, the time, and the browser's time zone. Zernio publishes it at that time.
Scheduling from **Vera's posts** first approves the current version in the name of the
person who schedules it.

- The accounts are the ones connected in Zernio, read with the project's Zernio key
  (Settings → Integrations → Services).
- Instagram takes a post or a story, with a JPEG or PNG image. A Reel is always a video,
  so Studio images cannot be posted as one.
- Zernio fetches the image from its public URL, `API_URL/studio/posts/<id>/image`, so
  `API_URL` must be reachable over HTTPS.
- When Zernio refuses the post, nothing is recorded and the draft stays approved.

## Setting up Vera

1. In the project, give the external agent `vera-agent` a role with Studio read, create
   and edit, and turn on MCP for the project.
2. Copy the agent's API key (Settings → AI agents → regenerate the key if it is not at
   hand).
3. On the Hermes host, add the MCP server to Vera's profile and enter the key at the
   hidden bearer prompt:

   ```bash
   hermes -p vera-social mcp add vexol --url "https://<API_ORIGIN>/mcp" --auth header
   hermes -p vera-social mcp test vexol
   ```

4. Restart the Hermes gateway so new Vera sessions load the server. Image generation
   takes up to two minutes; the MCP client timeout for this server must allow that.
