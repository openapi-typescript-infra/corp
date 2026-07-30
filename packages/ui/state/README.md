# UI state

Shared headless state for browser and native applications.

## Agent conversations

`createConversationStore` manages creation, restoration, streaming text, tool calls, and tool
responses through the public REST API. Authentication stays platform-specific by passing a custom
`fetch` implementation in `clientOptions` when cookies are not available.

```ts
const conversation = createConversationStore({
  apiEndpoint: 'https://api.example.com',
  appName: 'example-web',
  appVersion: '1.0.0',
  type: 'example-assistant',
  stream: true,
});

await conversation.send('Help me understand this.');
```
