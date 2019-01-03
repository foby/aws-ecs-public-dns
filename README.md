# Automatic public DNS for Fargate-managed containers in Amazon ECS

Fargate-managed containers in ECS lack build-in support for registering services into public DNS namespaces (12/2018). This is an event-driven approach to automatically register the public IP of a deployed container in a Route 53 hosted zone.

See [this blog post](https://medium.com/@andreas.pasch/automatic-public-dns-for-fargate-managed-containers-in-amazon-ecs-f0ca0a0334b5) for more information.

## How it works

A lambda function subscribes to an "ECS Task State Change" event. It gets called whenever a container has started up. What the function does is :

* fetching the public IP from the container
* construct a subdomain for the container
* register the public IP for the subdomain in Route 53

## Installation

You need to have the *Serverless Framework* CLI installed. 

Deploy the function in your active AWS account:

```
serverless deploy
```


In your ECS console, select your cluster and add the tags

* hostedZoneId (the hosted zone id of your public DNS namespace)
* domain (the domain name of your public DNS namespace)

## Demo

Well, just start a Fargate task in your cluster. When the task has started up, the function creates an A-record-set in your hosted zone with the containers' service name as subdomain.

