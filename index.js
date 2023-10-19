import { AptosClient, AptosAccount, CoinClient } from "aptos";
import { Buffer } from "buffer";
import { config } from "./config.js";
import consoleStamp from 'console-stamp';
import fs from 'fs'

consoleStamp(console, { format: ':date(HH:MM:ss)' });

const parseFile = fileName => fs.readFileSync(fileName, "utf8").split('\n').map(str => str.trim()).filter(str => str.length > 10);
const generateRandomNumber = (min, max) => Math.round(Math.random() * (max - min) + min);
const timeout = ms => new Promise(res => setTimeout(res, ms))

const client = new AptosClient(config.rpc);
const coinClient = new CoinClient(client)
const retriesMap = new Map();

function handleRetries(address) {
    let maxRetries = config.retries;
    let count = retriesMap.get(address) + 1 || 1;
    retriesMap.set(address, count);

    return count < maxRetries
}

async function sendTransaction(sender, payload) {
    try {
        const txnRequest = await client.generateTransaction(sender.address(), payload);
        const signedTxn = await client.signTransaction(sender, txnRequest);
        const transactionRes = await client.submitTransaction(signedTxn);
        console.log(`tx: https://explorer.aptoslabs.com/txn/${transactionRes?.hash}?network=mainnet`);

        return await client.waitForTransactionWithResult(transactionRes.hash, { checkSuccess: true })
    } catch (err) {
        try {
            console.log('[ERROR]', JSON.parse(err?.message).message)
        } catch { console.log('[ERROR]', err.message) }

        if (handleRetries(sender.address().toString())) {
            await timeout(10000)
            return await sendTransaction(sender, payload)
        }
    }
}


async function drawGraffiti(sender, payload) {
    console.log(`Drawing ${payload[1].length} pixels`);

    return await sendTransaction(sender, {
        function: "0x915efe6647e0440f927d46e39bcb5eb040a7e567e1756e002073bc6e26f2cd23::canvas_token::draw",
        type_arguments: [],
        arguments: payload
    })
}

function generatePixels() {
    let pixelsCount = generateRandomNumber(config.pixelsCount.from, config.pixelsCount.to);
    let pixels = [];

    for (let i = 0; i < pixelsCount; i++) {
        pixels.push({
            x: generateRandomNumber(0, 999),
            y: generateRandomNumber(0, 999),
            color: generateRandomNumber(0, 7)
        })
    }

    return pixels
}

function generatePayload(pixelsArray) {
    let axisX = [], axisY = [], colors = [];

    for (let pixel of pixelsArray) {
        axisX.push(pixel.x);
        axisY.push(pixel.y);
        colors.push(pixel.color);
    }

    return ["0x5d45bb2a6f391440ba10444c7734559bd5ef9053930e3ef53d05be332518522b", axisX, axisY, colors]
}

async function checkBalance(account) {
    try {
        let balance = Number(await coinClient.checkBalance(account)) / 100000000;
        console.log(`Balance ${balance} APT`);

        return balance
    } catch (err) {
        try {
            console.log('[ERROR]', JSON.parse(err?.message).message)
        } catch {
            console.log('[ERROR]', err.message)
        }
        await timeout(1000)
        return await checkBalance(account)
    }
}

(async () => {
    let privateKeys = parseFile('wallets.txt')

    for (let str of privateKeys) {
        const pk = str.slice(2, str.length);
        const account = new AptosAccount(Uint8Array.from(Buffer.from(pk, 'hex')));
        const address = account.address().toString();
        console.log(address);
        const balance = await checkBalance(account)

        if (balance > 0) {
            const pixels = generatePixels();
            const payload = generatePayload(pixels);
            await drawGraffiti(account, payload);
            console.log("-".repeat(130));
        }
    }
})()