'use strict';

let AWS = require('aws-sdk');
let ec2 = new AWS.EC2();
let ecs = new AWS.ECS();
let route53 = new AWS.Route53();

/**
 * Upsert a public ip DNS record for the incoming task.
 *
 * @param event contains the task in the 'detail' propery
 */
exports.handler = async (event, context, callback) => {
    console.log('Received event: %j', event);

    const task = event.detail;
    const clusterArn = task.clusterArn;
    console.log(`clusterArn: ${clusterArn}`)

    const clusterName = clusterArn.split(':cluster/')[1];

    const tags = await fetchClusterTags(clusterArn)
    const domain = tags['domain']
    const hostedZoneId = tags['hostedZoneId']

    console.log(`cluster: ${clusterName}, domain: ${domain}, hostedZone: ${hostedZoneId}`)

    if (!domain || !hostedZoneId) {
        console.log(`Skipping. Reason: no "domain" and/or "hostedZoneId" tags found for cluster ${clusterArn}`);
        return;
    }
    
    const eniId = getEniId(task);
    if (!eniId) {
        console.log('Network interface not found');
        return;
    }

    const taskPublicIp = await fetchEniPublicIp(eniId)
    const serviceName = task.group.split(":")[1]
    console.log(`task:${serviceName} public-id: ${taskPublicIp}`)

    const containerDomain = `${serviceName}.${domain}`
    const changeRecordSet = createChangeRecordSet(containerDomain, taskPublicIp)

    await updateDnsRecord(clusterName, hostedZoneId, changeRecordSet)
    console.log(`DNS record update finished for ${containerDomain} (${taskPublicIp})`)
};

async function fetchClusterTags(clusterArn) {
    const response = await ecs.listTagsForResource({
        resourceArn: clusterArn
    }).promise()
    const tags = {}
    for (let i=0; i<response.tags.length; i++) {
        const tag = response.tags[i]
        const key = tag['key']
        const value = tag['value']
        tags[key] =  value
    }
    return tags
}

function getEniId(task) {
    let eniAttachment = [];
    for (let i = 0; i < task.attachments.length; i++) {
        const attachment = task.attachments[i];
        if (attachment.type === 'eni') {
            eniAttachment = attachment;
            break;
        }
    }
    for (let i = 0; i < eniAttachment.details.length; i++) {
        const detail = eniAttachment.details[i];
        if (detail.name === 'networkInterfaceId') {
            return detail.value;
        }
    }
    return null;
}

async function fetchEniPublicIp(eniId) {
    const data = await ec2.describeNetworkInterfaces({
        NetworkInterfaceIds: [
            eniId
        ]
    }).promise();

    return data.NetworkInterfaces[0].PrivateIpAddresses[0].Association.PublicIp;
}

function createChangeRecordSet(domain, publicIp) {
    return {
        "Action": "UPSERT",
        "ResourceRecordSet": {
            "Name": domain,
            "Type": "A",
            "TTL": 180,
            "ResourceRecords": [
                {
                    "Value": publicIp
                }
            ]
        }
    }
}

async function updateDnsRecord(clusterName, hostedZoneId, changeRecordSet) {
    let param = {
        ChangeBatch: {
            "Comment": `Auto generated Record for ECS Fargate cluster ${clusterName}`,
            "Changes": [changeRecordSet]
        },
        HostedZoneId: hostedZoneId
    };
    const updateResult = await route53.changeResourceRecordSets(param).promise();
    console.log('updateResult: %j', updateResult);
}
