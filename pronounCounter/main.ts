//npm install fs-extra date-fns @types/node @types/fs-extra typescript @slack/bolt

// logWarn(message: string)
// logError(message: string, errorJSON: any)
// (message: string)
import { App } from '@slack/bolt';
import * as dotenv from 'dotenv';
import { log, logError, logWarn } from './loger';
import fs from 'fs-extra'
import path from 'path'

dotenv.config();

log("starting...")

// Initializes app with bot token and app token for Socket Mode
const app = new App({
    token: process.env.SLACK_BOT_TOKEN!,
    appToken: process.env.SLACK_APP_TOKEN!,
    signingSecret: process.env.SLACK_SIGNING_SECRET!,
    socketMode: true,
});

// async function attemptReconnect() {
//     try {
//         log('Attempting to reconnect...');
//         await app.start();
//         log('Reconnected successfully!');
//     } catch (error) {
//         logError('Reconnection failed:', error);
//         setTimeout(attemptReconnect, 5000); // Retry after 5 seconds
//     }
// }

class PronounCountMap {
    [key: string]: number;
}

function countPronouns(bios: string[]): PronounCountMap {
    const pronounGroups: { [key: string]: string[] } = {
        //"Primary pronoun": ["Groups"]
        "they": ["they", "them"],
        "she": ["she", "her"],
        "he": ["he", "him"]
    };

    const counts: PronounCountMap = {};

    bios.forEach(bio => {
        let lowerBio = bio.toLowerCase();
        const matchedPronouns: string[] = [];

        for (const [primaryPronoun, group] of Object.entries(pronounGroups)) {
            // Check if any pronoun in the group exists in the bio
            if (group.some(pronoun => lowerBio.includes(pronoun)) && !lowerBio.includes("unset for: ")) {
                matchedPronouns.push(primaryPronoun);

                // Remove matched pronouns from the bio to avoid double counting
                group.forEach(pronoun => {
                    lowerBio = lowerBio.replace(new RegExp(`\\b${pronoun}\\b`, 'g'), '');
                });
            }
        }

        const key = matchedPronouns.length > 0 ? matchedPronouns.join("/") : "unknown";

        if (counts[key]) {
            counts[key]++;
        } else {
            counts[key] = 1;
        }
    });

    return counts;
}


async function getAllUserIDs() {
    const allUsers: { id: string, updated: number }[] = []; // Store both user ID and updated timestamp
    let nextCursor: string | undefined = undefined;
    const limit = 1000; // Max limit of users per request
    const maxRequestsPerMinute = 20; // Slack's rate limit
    const delayBetweenBatches = 60 * 1000 / maxRequestsPerMinute; // Delay per request

    try {
        do {
            // Fetch a batch of users
            const response = await app.client.users.list({
                limit: limit,
                cursor: nextCursor
            });

            // Collect the user IDs and updated timestamps, filter out those without IDs or timestamps
            const users = response.members
                ?.filter(user => user.id && user.updated)
                .map(user => ({
                    id: user.id as string,
                    updated: user.updated as number
                })) || [];

            allUsers.push(...users);
            log(`Got ${users.length} more user ID's. Currently there are ${allUsers.length} user id's cached`);

            // Check if there's another page of users
            nextCursor = response.response_metadata?.next_cursor;

            // Rate limit: Delay between requests to avoid hitting the 100 requests per minute limit
            await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        } while (nextCursor); // Continue fetching if there are more pages

        log("Starting to sort...")
        // Sort users by the 'updated' field in descending order (newest first)
        allUsers.sort((a, b) => b.updated - a.updated);
        log("Done sorting")

        // Extract and return only the sorted user IDs
        return allUsers.map(user => user.id);
    } catch (error) {
        logError('Error fetching user IDs:', error);
        return [];
    }
}

async function collectUserFieldValues(userIDs: string[]) {
    log("Starting to collect feilds...")
    const fieldValues: string[] = []; // Array to store the field values
    const maxRequestsPerMinute = 100; // Slack rate limit for users.profile.get
    const delayBetweenRequests = 60 * 1000 / maxRequestsPerMinute; // Delay per request to stay within rate limit
    const saveInterval = 5 * 60 * 1000; // Save array every 5 minutes

    let nextSaveTime = Date.now() + saveInterval;

    try {
        for (let i = 0; i < userIDs.length; i++) {
            const userID = userIDs[i];

            try {
                // Fetch the user's profile
                const response = await app.client.users.profile.get({
                    user: userID
                });

                // Check if the pronoun field 'XfD4V9MG3V' exists, add to array if it does
                const fieldValue = response.profile?.fields?.XfD4V9MG3V?.value;
                if (fieldValue) {
                    fieldValues.push(fieldValue);
                    // console.log("Got ID!")
                } else { 
                    fieldValues.push("unset for: "+userID);
                }

                // Check if it's time to save the array
                if (Date.now() >= nextSaveTime) {
                    saveArray(fieldValues, "currentBios.txt");
                    log(`Array saved, total pronouns collected: ${fieldValues.length}`);
                    nextSaveTime = Date.now() + saveInterval; // Reset save timer
                }
            } catch (profileError) {
                logError(`Error fetching profile for user ${userID}:`, profileError);
            }

            // Respect the rate limit
            if (i < userIDs.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
            }
        }

        // Final save after all users have been processed
        saveArray(fieldValues, "final-output.txt");
        log("Final save completed after processing all users.");
    } catch (error) {
        logError('Error processing user IDs:', error);
    }
}

async function run() {
    log("Hey there! \nJust a warning, this script is configured for the hackclub slack, so you may need to modify the `collectUserFieldValues` function to work with your workspace.\n\nThis script takes about 7 hours to run per 50k people due to slack's rate limits, so try to run it overnight and make sure your computer does not turn off.\nI've implemented some basic periodic saves so you can modify the code to restore from where it left us if you have any issues.")
    log("Starting to get user ID's")
    await writeToFile(JSON.stringify(await getAllUserIDs(), null, 2))
    log("Done getting user ID's")
    let userIDs = await JSON.parse(await readFile("output.txt"))
    log("Starting to get pronouns")
    await collectUserFieldValues(userIDs)
    log("Done getting pronouns!")
    log("Starting to sort...")
    log(JSON.stringify(countPronouns(JSON.parse(await readFile("final-output.txt"))), null, 2))
    log("Done sorting!")
    
}
run()

async function saveArray(logMessage: string[], fileName:string) {
    const scriptDirectory = __dirname
    const outputFilePath = path.join(scriptDirectory, './'+fileName)
    try {
        await fs.writeFile(outputFilePath, JSON.stringify(logMessage, null, 2))
    } catch (err) {
        console.error('Failed to write to log file:', err)
    }
}

async function writeToFile(logMessage: string) {
    const scriptDirectory = __dirname
    const logFilePath = path.join(scriptDirectory, './output.txt')
    try {
        await fs.writeFile(logFilePath, '\n' + logMessage)
    } catch (err) {
        console.error('Failed to write to log file:', err)
    }
}

async function readFile(fileName:string):Promise<string> {
    const scriptDirectory = __dirname;
    const filePath = path.join(scriptDirectory, './'+fileName);
    try {
        const data = await fs.readFile(filePath, 'utf-8'); //Not to future self: need to specify encoding to get string directly
        return data; // Convert string to JSON format if needed
    } catch (err) {
        logError('Failed to read log file:', err);
        return "ERROR";
    }
}
