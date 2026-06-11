#!/bin/bash

# Gaia Code Harness - Presentation Script
# Interactive presentation for the team

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Presentation slides
slides=()
slides+=(
"${BLUE}========================================
  GAIA CODE HARNESS
  Controlled AI Code Generation
========================================${NC}

What if we could use AI to generate code,
but with the same level of control and quality
we expect from a senior developer?

It's not magic. It's Harness Engineering.

Press Enter to continue..."

"${YELLOW}[SLIDE 1] The Problem${NC}

Three main pain points:

1. ${RED}AI generates code that doesn't match requirements${NC}
   - Hallucinations
   - Wrong assumptions
   - Missing context

2. ${RED}No visibility into what changed${NC}
   - "Magic" black box
   - Hard to review
   - Quality concerns

3. ${RED}Integration friction${NC}
   - Manual copy-paste
   - Formatting issues
   - Context switching

Press Enter to continue..."

"${YELLOW}[SLIDE 2] The Solution: Harness Engineering${NC}

Instead of letting AI run wild, we put it in a harness:

${GREEN}✓${NC} Limited, powerful tools
${GREEN}✓${NC} External memory (PostgreSQL)
${GREEN}✓${NC} Multi-agent system
${GREEN}✓${NC} Human checkpoints
${GREEN}✓${NC} Verification required

Three specialized agents:
1. SpecAuthor - Creates technical specs
2. Implementer - Writes code
3. Reviewer - Validates and creates PRs

Press Enter to continue..."

"${YELLOW}[SLIDE 3] Spec-Driven Development${NC}

The specification is the source of truth:

${CYAN}requirements.md${NC} - What to build
${CYAN}design.md${NC} - How to build it
${CYAN}tasks.json${NC} - Executable steps

Format: EARS (Easy Approach to Requirements Syntax)
${GREEN}WHEN [condition] THEN [action]${NC}

Example:
  WHEN user opens home screen
  THEN display promotional banner

Press Enter to continue..."

"${YELLOW}[SLIDE 4] The Workflow${NC}

${GREEN}1. PM creates initiative in Gaia${NC}
   ↓
${GREEN}2. SpecAuthor generates technical spec${NC}
   ↓
${CYAN}3. HUMAN REVIEWS and APPROVES spec${NC} ⭐
   ↓
${GREEN}4. Implementer writes code${NC}
   ↓
${GREEN}5. Reviewer validates and creates PR${NC}
   ↓
${CYAN}6. Human code review (normal process)${NC}

Key: Two human checkpoints for quality control

Press Enter to continue..."

"${YELLOW}[SLIDE 5] Technical Architecture${NC}

${BLUE}Components:${NC}
- Fastify API server
- PostgreSQL for persistence
- 3 Agent system
- Plugin system for custom agents
- GitHub/Jira integration

${BLUE}State Machine:${NC}
10 states from 'pending' to 'done'

${BLUE}Security:${NC}
- Human approval required
- File change limits
- Test verification
- Traceability to spec

Press Enter to continue..."

"${YELLOW}[SLIDE 6] Demo${NC}

Let's see it in action!

Make sure the server is running:
  ${CYAN}npm run dev${NC}

Then run the demo:
  ${CYAN}./scripts/demo.sh${NC}

This will:
1. Create a job
2. Generate a spec
3. Wait for approval
4. Implement the code
5. Create a PR

Press Enter to start demo (or 'q' to skip)..."
)

# Show slides
for slide in "${slides[@]}"; do
    clear
    echo -e "$slide"
    read -r
    if [ "$REPLY" = "q" ]; then
        break
    fi
done

# Ask if they want to run the demo
echo ""
echo -e "${YELLOW}Would you like to run the demo now? (y/n)${NC}"
read -r
if [ "$REPLY" = "y" ]; then
    ./scripts/demo.sh
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Thank you!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Questions to discuss:"
echo "  - Should we adopt this for the team?"
echo "  - Which repo should we pilot with?"
echo "  - What are the main concerns?"
echo ""
echo "See docs/GUION_PRESENTACION.md for the full presentation script"
