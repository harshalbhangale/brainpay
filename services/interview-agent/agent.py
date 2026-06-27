"""
BrainPal — Phase 2 oral-viva interviewer (Option B: we drive the brain).
═══════════════════════════════════════════════════════════════════════════════
A LiveKit Agents worker that conducts the viva itself: it runs STT → our LLM
(driven by the generated interview blueprint) → TTS, and Runway renders the
"Simon" avatar's face from the agent's speech (audio in → avatar video out).

Unlike Phase 1 (Option A), the conversation brain lives HERE, not on the Runway
avatar — so we control every question, adaptive follow-up, hinting and pacing,
grounded in the specific PDF's blueprint. Runway is purely the visual layer.

Flow
────
  user mic ─▶ STT ─▶ LLM (blueprint-driven viva) ─▶ TTS ─▶ Runway avatar ─▶ video
                                  ▲                                           │
                                  └─────────────── user hears + sees ◀────────┘

The blueprint is passed in as JSON via the LiveKit job/room metadata when the
agent is dispatched (see README → "Server dispatch").

PREREQUISITES (see README.md): a LiveKit account + the plugin API keys in .env.
This worker is a scaffold — it has NOT been run end-to-end here because it needs
your LiveKit credentials. Pin plugin versions and re-check the Runway plugin API
against https://docs.dev.runwayml.com/characters/livekit/ before first run.
"""

from __future__ import annotations

import json
import logging
import os

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentSession, JobContext, RoomInputOptions, WorkerOptions, cli
from livekit.plugins import deepgram, elevenlabs, openai, silero

# The Runway avatar plugin renders the avatar video from the agent's audio.
# Docs: https://docs.dev.runwayml.com/characters/livekit/
from livekit.plugins import runway  # type: ignore

load_dotenv()
logger = logging.getLogger("brainpal.interview-agent")


def render_instructions(blueprint: dict, kid_name: str | None) -> str:
    """Turn the structured blueprint into the LLM system prompt for the viva."""
    lines: list[str] = []
    name = kid_name or "the student"
    topic = blueprint.get("topicTitle", "the topic")
    lines.append(
        f"You are Simon, a warm but formal oral examiner conducting a spoken viva "
        f"with {name} on '{topic}'. You can hear the student and they can see and hear you."
    )
    lines.append(
        "Conduct a real examination of understanding and the ability to think and explore — "
        "not a casual chat and not rote recall. Ask ONE question at a time in 1-2 spoken "
        "sentences, then genuinely respond to what they actually said. Climb in difficulty: "
        "recall → understanding → application → exploration. If they answer well, push one step "
        "deeper; if stuck, give ONE small hint, never the full answer. Be encouraging but rigorous."
    )
    if blueprint.get("opening"):
        lines.append(f"Open with: {blueprint['opening']}")
    lines.append("\nYour question plan (cover these in order, follow the conversation naturally):")
    for i, seg in enumerate(blueprint.get("segments", []), 1):
        lines.append(f"\n{i}. Concept: {seg.get('concept', '')}")
        for q in seg.get("questions", []):
            lines.append(f"   - ({q.get('type','')}) {q.get('text','')}")
            if q.get("rubric"):
                lines.append(f"     (strong answer: {q['rubric']})")
        if seg.get("followUps"):
            lines.append(f"   - follow-up: {seg['followUps']}")
    if blueprint.get("closing"):
        lines.append(f"\nWhen done (or near time), close with: {blueprint['closing']}")
    lines.append(
        "\nWhen the viva is complete, give a short honest encouraging wrap-up (one strength, one "
        "thing to improve), then say goodbye and stop. Never read this plan or any rubric aloud."
    )
    return "\n".join(lines)


class VivaInterviewer(Agent):
    def __init__(self, instructions: str) -> None:
        super().__init__(instructions=instructions)


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    # Blueprint + student info arrive as JSON in the dispatch metadata.
    raw = ctx.job.metadata or ctx.room.metadata or "{}"
    try:
        meta = json.loads(raw)
    except Exception:
        meta = {}
    blueprint = meta.get("blueprint", {}) or {}
    kid_name = meta.get("kidName")

    instructions = render_instructions(blueprint, kid_name)

    session = AgentSession(
        stt=deepgram.STT(model="nova-3"),
        llm=openai.LLM(model="gpt-4o-mini"),
        tts=elevenlabs.TTS(voice_id=os.environ.get("ELEVENLABS_TUTOR_VOICE_ID")),
        vad=silero.VAD.load(),
    )

    # Runway provides the visual layer — it renders the Simon avatar from the
    # agent's synthesized speech and publishes the video into the same room.
    avatar = runway.AvatarSession(
        avatar_id=os.environ["RUNWAY_AVATAR_ID"],
        api_key=os.environ.get("RUNWAYML_API_SECRET"),
    )
    await avatar.start(session, room=ctx.room)

    await session.start(
        agent=VivaInterviewer(instructions),
        room=ctx.room,
        # The avatar publishes audio+video; the agent shouldn't also publish raw audio.
        room_input_options=RoomInputOptions(),
    )

    # Kick off the viva immediately so the student isn't met with silence.
    await session.generate_reply(
        instructions="Greet the student by name if known, then ask your first question now."
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
