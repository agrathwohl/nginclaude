# nginclaude 🧠🚈

Why pay for cloud credits when you already are paying for Claude?

## What Fresh Hell Is This?

`nginclaude` is what happens when I'm feeling thoroughly optimistic. It's a reverse proxy server that replaces nginx's boring, reliable configuration files with the same exact thing but it takes a hell of a lot longer. Using Claude 3 Haiku, this abomination decides where to route your precious production traffic based on vibes and whatever hallucinations it's having that millisecond.

## "Features" (AKA Ways This Will Destroy Your Weekend)

- **LLM Russian Roulette**: Watch as Claude sometimes routes correctly and other times sends your sensitive customer data to `/dev/null`
- **Fallback Mechanism**: When Claude inevitably breaks, falls back to actual working code that you should have just used in the first place
- **Cloud Bill Maximizer**: Ensures your Anthropic API costs exceed your entire infrastructure budget
- **Vercel Compatibility**: Because nothing says "I make poor life choices" like running this on serverless
- **Multiple Backends**: Route requests to multiple backend services simultaneously for maximum chaos

## Installation (At Your Own Risk)

```bash
# Install dependencies (and approximately 87,000 subdependencies of questionable origin)
npm install

# Build TypeScript (and pray the types aren't as made-up as Claude's responses)
npm run build
```

## Setup (AKA Digital Self-Flagellation)

1. Copy `.env.example` to `.env` and add your Anthropic API key:

```bash
cp .env.example .env
# Insert your life savings here
```

2. Edit the `.env` file to specify how quickly you want to bankrupt your startup:

```
ANTHROPIC_API_KEY=your-anthropic-api-key-that-definitely-wont-get-leaked
PORT=3000
DIGNITY_LEVEL=0
```

3. Configure your routes in `nginclaude-proxy.conf` (that Claude will promptly ignore):

```
http {
    server {
        listen 3000;
        server_name localhost;

        # API Service - Where Claude will occasionally send cat pictures
        location /api {
            proxy_pass http://localhost:8001;
        }

        # Admin Service - Secured with the digital equivalent of a "KEEP OUT" sign
        location /admin {
            proxy_pass http://localhost:8003;
        }

        # Static Files Service - Where your JavaScript goes to die
        location /static {
            proxy_pass http://localhost:8004;
        }

        # Default Web Service - Claude's favorite dumping ground
        location / {
            proxy_pass http://localhost:8002;
        }
    }
}
```

## Usage (Or: How I Learned to Stop Worrying and Love Unemployment)

### Start the "proxy" "server"

```bash
# Start with npm (and a prayer)
npm start

# Or if you prefer more explicit error messages
node dist/vercel-proxy.js 2>&1 | tee evidence-for-your-firing.log
```

### Debug Mode (For Masochists)

```bash
npm run dev
# Then watch as your terminal fills with Claude's stream-of-consciousness routing decisions
```

### Test with mock backends (Because real backends deserve better)

1. Start the mock backend services:

```bash
npx ts-node tests/mock-backends.ts
# These actually work, which is the best joke in this entire project
```

2. In another terminal, summon the eldritch horror:

```bash
npm run dev
```

3. In a third terminal, witness the carnage:

```bash
npx ts-node tests/test-requests.ts
# Keep refreshing until it works or your AWS bill exceeds your mortgage
```

## Implementation (Welcome to Vercel Hell)

This project exclusively uses Vercel's AI SDK, because why have options when you can be locked into a single ecosystem?

```bash
# Start the proxy server locally
npm run dev

# Build for Vercel deployment
npm run build

# Watch as Vercel's free tier throttles your requests to oblivion
vercel deploy
```

IMPORTANT: This project is designed to be deployed to Vercel, so just do that. It's cool because now there's a way top deploy a reverse proxy for cheap/free on a stable (sometimes) host.

## Benchmarking

Want to measure exactly how much this monstrosity will slow down your application? We've included a handy benchmark script that will quantify your suffering!

```bash
# First, start the mock backend services
npm run mock-backends

# In another terminal, start nginclaude
npm run dev

# In yet another terminal, start the comparison proxies
npm run setup-proxies

# Finally, run the benchmark (10 iterations against /api/users endpoint)
npm run benchmark -- 10 /api/users
```

The benchmark will compare nginclaude against:

- nginx (if you've set it up with the generated config)
- a basic http-proxy implementation
- a fastify-proxy implementation

Results will show you exactly how many milliseconds of your life you're wasting per request, along with a helpful multiplier showing how much slower AI-powered routing is compared to traditional configuration.

## FAQ

**Q: Is this production-ready?**  
A: Only if you hate your users, your infrastructure, and yourself.

**Q: How much will this cost to run?**  
A: Less than therapy, but more than a sensible nginx config.

**Q: Why not just use regular nginx?**  
A: And miss the opportunity to put "AI Engineer" on your LinkedIn? Please.

**Q: Should I actually benchmark this against real proxies?**  
A: Only if you enjoy watching numbers that make grown DevOps engineers cry.

## License

MIT
