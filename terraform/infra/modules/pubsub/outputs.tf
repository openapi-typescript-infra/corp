output "topic_ids" {
  description = "Map of logical topic name to Pub/Sub topic ID"
  value = {
    for key, topic in google_pubsub_topic.topics : key => topic.id
  }
}

output "subscription_ids" {
  description = "Map of logical subscription key to Pub/Sub subscription ID"
  value = {
    for key, sub in google_pubsub_subscription.subscriptions : key => sub.id
  }
}
