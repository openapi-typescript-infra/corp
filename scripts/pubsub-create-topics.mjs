#!/usr/bin/env node
import { PubSub } from '@google-cloud/pubsub';

// Topics are defined inline here for now. When a shared topic registry is added
// (e.g. a `data-formats` package exporting `Topics`), import from there instead.
const Topics = {};

const projectId = process.env.PUBSUB_PROJECT_ID;
if (!projectId) {
  console.error('PUBSUB_PROJECT_ID is required');
  process.exit(1);
}
if (!process.env.PUBSUB_EMULATOR_HOST) {
  console.error('PUBSUB_EMULATOR_HOST is required (this script only manages dev emulator topics)');
  process.exit(1);
}

const topicNames = Object.keys(Topics);
if (topicNames.length === 0) {
  console.log('  (no topics defined yet)');
  process.exit(0);
}

const pubsub = new PubSub({ projectId });

const ALREADY_EXISTS = 6;
let created = 0;
let existed = 0;
for (const name of topicNames) {
  try {
    await pubsub.createTopic(name);
    console.log(`  created: ${name}`);
    created++;
  } catch (err) {
    if (err.code === ALREADY_EXISTS) {
      console.log(`  exists:  ${name}`);
      existed++;
    } else {
      console.error(`  FAILED:  ${name} — ${err.message}`);
      process.exit(1);
    }
  }
}

console.log(`Pub/Sub topics ready (${created} created, ${existed} existing)`);
