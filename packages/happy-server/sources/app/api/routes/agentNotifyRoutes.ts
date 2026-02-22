import { z } from "zod";
import { type Fastify } from "../types";
import { eventRouter } from "@/app/events/eventRouter";

/**
 * Agent notification endpoint.
 * Accepts a message from a background agent and pushes it as an ephemeral
 * notification event to all active connections for the configured user.
 * No database write is performed — this is fire-and-forget realtime signalling.
 *
 * Auth: X-Agent-Token header checked against AGENT_NOTIFY_TOKEN env var.
 * Target user: AGENT_NOTIFY_USER_ID env var.
 */
export function agentNotifyRoutes(app: Fastify) {
    app.post('/v1/agent-notify', {
        schema: {
            body: z.object({
                message: z.string()
            }),
            response: {
                200: z.object({
                    ok: z.literal(true)
                }),
                401: z.object({
                    error: z.literal('Unauthorized')
                }),
                503: z.object({
                    error: z.literal('No active connections')
                })
            }
        }
    }, async (request, reply) => {
        // Auth check
        const token = request.headers['x-agent-token'];
        const expectedToken = process.env.AGENT_NOTIFY_TOKEN;
        if (!expectedToken || token !== expectedToken) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }

        const userId = process.env.AGENT_NOTIFY_USER_ID;
        if (!userId) {
            return reply.code(503).send({ error: 'No active connections' });
        }

        const { message } = request.body;

        const connections = eventRouter.getConnections(userId);
        if (!connections || connections.size === 0) {
            return reply.code(503).send({ error: 'No active connections' });
        }

        eventRouter.emitEphemeral({
            userId,
            payload: {
                type: 'notification',
                message,
                timestamp: Date.now()
            }
        });

        return reply.send({ ok: true });
    });
}
