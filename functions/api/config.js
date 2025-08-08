// File: functions/api/config.js

export async function onRequest(context) {
    // Structure your database pairs by reading from environment variables
    const databasePairs = [
        { general: { name: "A1", config: { apiKey: context.env.FIREBASE_API_KEY_A1, authDomain: context.env.FIREBASE_AUTH_DOMAIN_A1, projectId: context.env.FIREBASE_PROJECT_ID_A1 }}, student: { name: "A2", config: { apiKey: context.env.FIREBASE_API_KEY_A2, authDomain: context.env.FIREBASE_AUTH_DOMAIN_A2, projectId: context.env.FIREBASE_PROJECT_ID_A2 }}},
        { general: { name: "B1", config: { apiKey: context.env.FIREBASE_API_KEY_B1, authDomain: context.env.FIREBASE_AUTH_DOMAIN_B1, projectId: context.env.FIREBASE_PROJECT_ID_B1 }}, student: { name: "B2", config: { apiKey: context.env.FIREBASE_API_KEY_B2, authDomain: context.env.FIREBASE_AUTH_DOMAIN_B2, projectId: context.env.FIREBASE_PROJECT_ID_B2 }}},
        { general: { name: "C1", config: { apiKey: context.env.FIREBASE_API_KEY_C1, authDomain: context.env.FIREBASE_AUTH_DOMAIN_C1, projectId: context.env.FIREBASE_PROJECT_ID_C1 }}, student: { name: "C2", config: { apiKey: context.env.FIREBASE_API_KEY_C2, authDomain: context.env.FIREBASE_AUTH_DOMAIN_C2, projectId: context.env.FIREBASE_PROJECT_ID_C2 }}},
        { general: { name: "D1", config: { apiKey: context.env.FIREBASE_API_KEY_D1, authDomain: context.env.FIREBASE_AUTH_DOMAIN_D1, projectId: context.env.FIREBASE_PROJECT_ID_D1 }}, student: { name: "D2", config: { apiKey: context.env.FIREBASE_API_KEY_D2, authDomain: context.env.FIREBASE_AUTH_DOMAIN_D2, projectId: context.env.FIREBASE_PROJECT_ID_D2 }}},
        { general: { name: "E1", config: { apiKey: context.env.FIREBASE_API_KEY_E1, authDomain: context.env.FIREBASE_AUTH_DOMAIN_E1, projectId: context.env.FIREBASE_PROJECT_ID_E1 }}, student: { name: "E2", config: { apiKey: context.env.FIREBASE_API_KEY_E2, authDomain: context.env.FIREBASE_AUTH_DOMAIN_E2, projectId: context.env.FIREBASE_PROJECT_ID_E2 }}}
    ];

    // Select a random pair to use for this session
    const selectedPair = databasePairs[Math.floor(Math.random() * databasePairs.length)];

    // Send the selected configuration to the client
    return new Response(JSON.stringify(selectedPair), {
        headers: { 'Content-Type': 'application/json' },
    });
}