'use strict';

// imports
const fs = require('fs');
const rp = require('request-promise');
const r = require('request');
var glob = require('glob');
const unzipper = require('unzipper');
const Client = require('kubernetes-client').Client
var client;

// IAM Authorization Token
let authToken;
let refreshToken;
const authUrl = 'https://iam.cloud.ibm.com/identity/token';
const IKSAPIHost = 'https://containers.cloud.ibm.com';


// Authenticate with IAM
async function authenticate(icApiToken) {
    //console.log("\nRetrieving auth token...");
    //console.log("API Token: " + icApiToken);
    //console.log("Auth URL: " + authUrl);
    //iamOptions.data.apikey = icApiToken

    await rp({
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
        },
        method: 'POST',
        uri: authUrl,
        auth: {
            'user': 'bx',
            'pass': 'bx'
        },
        form: {
            apikey: icApiToken,
            grant_type: 'urn:ibm:params:oauth:grant-type:apikey'
        },
        json: true
    }).on('complete', function (data, response) {
        //return data
        //console.log('sdasd' + JSON.stringify(response));
        refreshToken = response.refresh_token;
        authToken = response.access_token;
        //console.log('rt=' + refreshToken);
        return response;
    });
};

const getKubeConfig = async (clusterId,k8s_namespace, k8s_deployment, k8s_replica) => {
    console.log('here')
    let file = fs.createWriteStream(`${__dirname}/response.zip`);
    r({
        method: 'GET',
        encoding: null,
        uri: `${IKSAPIHost}/global/v1/clusters/${clusterId}/config`,
        headers: {
            'cache-control': 'no-cache',
            'Authorization': authToken,
            'X-Auth-Refresh-Token': refreshToken,
            'Content-type': 'application/zip'
        }
    })
        .pipe(file)
        .on('finish', async () => {
            console.log(`kubeConfig downloaded`);

            await fs.createReadStream(`${__dirname}/response.zip`)
                .pipe(unzipper.Extract({ path: __dirname }))
                .promise();
            console.log(`kubeConfig extracted`);
            await execKubeFunctions(k8s_namespace, k8s_deployment, k8s_replica)

        })
};

const execKubeFunctions = async (namespace, deployment, replica) => {

    glob("kubeConfig**/*.yml", { mark: true }, function (er, files) {
        console.log('file=' + files[files.length - 1]);

        const { KubeConfig } = require('kubernetes-client')
        const kubeconfig = new KubeConfig()
        const Request = require('kubernetes-client/backends/request')
        //const deploymentManifest = require('./nginx-deployment.json')
        kubeconfig.loadFromFile(files[files.length - 1])
        const backend = new Request({ kubeconfig })
        client = new Client({ backend, version: '1.13' })
        const replica_target = {
            spec: {
                replicas: parseInt(replica)
            }
        }
        client.apis.apps.v1.namespaces(namespace).deployments(deployment).patch({ body: replica_target }).then(result => console.log('Replica Scaled Successfully'));

    });

};

async function main(params) {

    const icApiToken = params.icApiToken;
    const clusterId = params.clusterId;
    const k8s_namespace = params.namespace;
    const k8s_deployment = params.deployment;
    const k8s_replica = params.replica;

    await authenticate(icApiToken);
    await getKubeConfig(clusterId,k8s_namespace,k8s_deployment,k8s_replica);

    return {};
}

//main()
exports.main = main;