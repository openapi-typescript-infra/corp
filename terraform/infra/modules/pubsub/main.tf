resource "google_pubsub_topic" "topics" {
  for_each = var.pubsub_topics

  name    = "${var.environment}_${each.key}"
  project = var.gcp_project_id
}

resource "google_pubsub_subscription" "subscriptions" {
  for_each = {
    for item in flatten([
      for topic_key, topic in var.pubsub_topics : [
        for sub in topic.subscriptions : {
          key       = "${topic_key}_${sub}"
          topic_key = topic_key
          sub_name  = sub
        }
      ]
    ]) : item.key => item
  }

  name    = "${var.environment}_${each.value.sub_name}"
  project = var.gcp_project_id
  topic   = google_pubsub_topic.topics[each.value.topic_key].id
}
