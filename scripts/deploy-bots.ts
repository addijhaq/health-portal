import { MedplumClient } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface BotEntry {
  name: string;
  id: string;
  source: string;
  dist: string;
}

interface MedplumConfig {
  bots: BotEntry[];
}

async function main(): Promise<void> {
  const baseUrl = process.env.MEDPLUM_BASE_URL;
  const clientId = process.env.MEDPLUM_CLIENT_ID;
  const clientSecret = process.env.MEDPLUM_CLIENT_SECRET;

  if (!baseUrl || !clientId || !clientSecret) {
    throw new Error(
      'Missing required environment variables: MEDPLUM_BASE_URL, MEDPLUM_CLIENT_ID, MEDPLUM_CLIENT_SECRET'
    );
  }

  const medplum = new MedplumClient({ baseUrl });

  console.log('Authenticating with Medplum...');
  await medplum.startClientLogin(clientId, clientSecret);
  console.log('Authentication successful.');

  const configPath = path.resolve(__dirname, '..', 'medplum.config.json');
  console.log(`Reading config from ${configPath}`);
  const config: MedplumConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  console.log(`Found ${config.bots.length} bot(s) in config.`);

  for (const botEntry of config.bots) {
    try {
      console.log(`\nProcessing bot: ${botEntry.name}`);

      const existingBot = await medplum.searchOne('Bot', { name: botEntry.name });

      let botId: string;

      if (existingBot) {
        botId = existingBot.id as string;
        console.log(`  Found existing bot "${botEntry.name}" with ID: ${botId}`);
      } else {
        console.log(`  Bot "${botEntry.name}" not found. Creating...`);
        const createdBot = await medplum.createResource<Bot>({
          resourceType: 'Bot',
          name: botEntry.name,
          runtimeVersion: 'awslambda',
          sourceCode: {
            contentType: 'text/typescript',
          },
        });
        botId = createdBot.id as string;
        console.log(`  Created bot "${botEntry.name}" with ID: ${botId}`);
      }

      botEntry.id = botId;
    } catch (error) {
      console.error(`  Error processing bot "${botEntry.name}":`, error);
    }
  }

  console.log('\nWriting updated IDs back to medplum.config.json...');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  console.log('Config file updated.');

  for (const botEntry of config.bots) {
    const sourcePath = path.resolve(__dirname, '..', botEntry.source);

    if (!fs.existsSync(sourcePath)) {
      console.log(`\nSkipping deploy for "${botEntry.name}" - source file not found: ${sourcePath}`);
      continue;
    }

    try {
      console.log(`\nDeploying bot: ${botEntry.name}`);
      execSync(`npx medplum bot deploy ${botEntry.name}`, {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'inherit',
      });
      console.log(`  Successfully deployed "${botEntry.name}".`);
    } catch (error) {
      console.error(`  Error deploying bot "${botEntry.name}":`, error);
    }
  }

  console.log('\nBot deployment complete.');
}

main().catch(console.error);
