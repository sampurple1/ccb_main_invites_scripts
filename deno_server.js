// Disqus API credentials
const DISQUS_API_KEY = 'Z9d73hD8QIb2bzsSwDDmzRLee1WTWx1AMgzrtpNtZStdhHuy3QWD1CV3NqcLUmAK';
const DISQUS_ACCESS_TOKEN = '6172ea960b324a69bd18a7d1963f72de';
const DISQUS_FORUM = 'thechitchatbar';

// Google Sheets configuration
const SHEET_ID = '11RzZip9zb5ig3IEustPA6jFv41atS73gOqBEhYHxyBE';
const SHEET_NAME = 'Sheet1';
const GOOGLE_SHEETS_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${SHEET_NAME}`;

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Fetch and parse Google Sheets data
async function fetchSheetData() {
  const response = await fetch(GOOGLE_SHEETS_URL);
  const csvText = await response.text();
  
  const lines = csvText.split('\n').map(line => line.replace(/"/g, '').trim()).filter(line => line);
  
  const groups = [];
  let currentGroup = null;
  
  for (const line of lines) {
    if (line.startsWith('Friends Group')) {
      if (currentGroup) {
        groups.push(currentGroup);
      }
      currentGroup = { name: line, usernames: [] };
    } else if (currentGroup && line.startsWith('@')) {
      currentGroup.usernames.push(line);
    }
  }
  
  if (currentGroup) {
    groups.push(currentGroup);
  }
  
  return groups;
}

// Random delay between 10-30 seconds
function randomDelay() {
  const delay = Math.floor(Math.random() * 20000) + 10000;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// Main handler
async function handler(req) {
  const url = new URL(req.url);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Health check
  if (url.pathname === '/' && req.method === 'GET') {
    return new Response(
      JSON.stringify({ status: 'Server is running', message: 'Send Invites API is active' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Send invites endpoint
  if (url.pathname === '/api/send-invites' && req.method === 'POST') {
    try {
      // Fetch latest thread from forum
      const threadsResponse = await fetch(`https://disqus.com/api/3.0/forums/listThreads.json?api_key=${DISQUS_API_KEY}&forum=${DISQUS_FORUM}&limit=1&order=desc`);
      const threadsData = await threadsResponse.json();

      if (threadsData.code !== 0 || !threadsData.response || threadsData.response.length === 0) {
        return new Response(
          JSON.stringify({ success: false, message: 'No threads found in forum' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const thread = threadsData.response[0];
      const threadId = thread.id;
      const createdAt = new Date(thread.createdAt);
      const now = new Date();
      const minutesDiff = (now - createdAt) / (1000 * 60);

      // Check if post is less than 10 minutes old
      if (minutesDiff >= 10) {
        return new Response(
          JSON.stringify({ success: false, message: `Latest post is ${Math.floor(minutesDiff)} minutes old (needs to be less than 10 minutes)` }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get thread posts count
      const postsResponse = await fetch(`https://disqus.com/api/3.0/threads/listPosts.json?api_key=${DISQUS_API_KEY}&thread=${threadId}`);
      const postsData = await postsResponse.json();

      if (postsData.code !== 0) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch posts' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const postsCount = postsData.response.length;

      // Check if post has less than 8 comments
      if (postsCount >= 8) {
        return new Response(
          JSON.stringify({ success: false, message: 'Latest post already has 8 or more comments' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch groups from Google Sheets
      const groups = await fetchSheetData();
      const results = [];

      // Post each group as a comment with random delay
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const commentText = `${group.name}\n\n${group.usernames.join('\n')}`;

        const formData = new URLSearchParams();
        formData.append('api_key', DISQUS_API_KEY);
        formData.append('access_token', DISQUS_ACCESS_TOKEN);
        formData.append('message', commentText);
        formData.append('thread', threadId);

        const postResponse = await fetch('https://disqus.com/api/3.0/posts/create.json', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: formData
        });

        const postResult = await postResponse.json();
        results.push({ group: group.name, status: postResult.code === 0 ? 'success' : 'failed', result: postResult });

        // Wait random delay before next post (except for last one)
        if (i < groups.length - 1) {
          await randomDelay();
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Posted ${groups.length} group comments to latest thread successfully`,
          threadTitle: thread.title,
          groupsPosted: groups.length,
          results
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  // 404 for other routes
  return new Response('Not Found', { status: 404, headers: corsHeaders });
}

Deno.serve(handler);
