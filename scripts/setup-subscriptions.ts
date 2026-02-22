import { MedplumClient } from '@medplum/core';
import type { AccessPolicy, Subscription } from '@medplum/fhirtypes';
import * as fs from 'fs';
import * as path from 'path';

interface PolicyResource {
  resourceType: string;
  readonly?: boolean;
}

interface PolicyEntry {
  name: string;
  description: string;
  compartment?: { reference: string };
  resource: PolicyResource[];
}

interface AccessPoliciesConfig {
  policies: PolicyEntry[];
}

interface SubscriptionEntry {
  name: string;
  criteria: string;
  reason: string;
  botName: string;
}

interface SubscriptionsConfig {
  subscriptions: SubscriptionEntry[];
}

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

  // --- Access Policies ---

  const policiesPath = path.resolve(__dirname, '..', 'config', 'fhir', 'access-policies.json');
  console.log(`\nReading access policies from ${policiesPath}`);
  const policiesConfig: AccessPoliciesConfig = JSON.parse(fs.readFileSync(policiesPath, 'utf-8'));

  console.log(`Found ${policiesConfig.policies.length} access policy/policies to create.`);

  for (const policy of policiesConfig.policies) {
    try {
      console.log(`\nCreating AccessPolicy: "${policy.name}"`);

      const resource = {
        resourceType: 'AccessPolicy' as const,
        name: policy.name,
        description: policy.description,
        resource: policy.resource,
        ...(policy.compartment && { compartment: policy.compartment }),
      };

      const created = await medplum.createResource(resource as AccessPolicy);
      console.log(`  Created AccessPolicy "${policy.name}" with ID: ${created.id}`);
    } catch (error) {
      console.error(`  Error creating AccessPolicy "${policy.name}":`, error);
    }
  }

  // --- Subscriptions ---

  const subscriptionsPath = path.resolve(__dirname, '..', 'config', 'fhir', 'subscriptions.json');
  console.log(`\nReading subscriptions from ${subscriptionsPath}`);
  const subscriptionsConfig: SubscriptionsConfig = JSON.parse(
    fs.readFileSync(subscriptionsPath, 'utf-8')
  );

  const medplumConfigPath = path.resolve(__dirname, '..', 'medplum.config.json');
  console.log(`Reading bot IDs from ${medplumConfigPath}`);
  const medplumConfig: MedplumConfig = JSON.parse(fs.readFileSync(medplumConfigPath, 'utf-8'));

  const botNameToId = new Map<string, string>();
  for (const bot of medplumConfig.bots) {
    if (bot.id) {
      botNameToId.set(bot.name, bot.id);
    }
  }

  console.log(`Found ${subscriptionsConfig.subscriptions.length} subscription definition(s).`);

  let createdCount = 0;
  let skippedCount = 0;

  for (const sub of subscriptionsConfig.subscriptions) {
    const botId = botNameToId.get(sub.botName);

    if (!botId) {
      console.log(
        `\nSkipping subscription "${sub.name}" - bot "${sub.botName}" has no ID (not yet deployed).`
      );
      skippedCount++;
      continue;
    }

    // Split comma-separated criteria into individual resource types.
    // Medplum requires one criteria per Subscription.
    const criteriaList = sub.criteria.split(',').map((c) => c.trim());

    for (const singleCriteria of criteriaList) {
      try {
        const subscriptionName =
          criteriaList.length > 1 ? `${sub.name}-${singleCriteria}` : sub.name;

        console.log(`\nCreating Subscription: "${subscriptionName}" (criteria: ${singleCriteria})`);

        const created = await medplum.createResource<Subscription>({
          resourceType: 'Subscription',
          status: 'active',
          reason: sub.reason,
          criteria: singleCriteria,
          channel: {
            type: 'rest-hook',
            endpoint: `Bot/${botId}`,
          },
        });

        console.log(`  Created Subscription "${subscriptionName}" with ID: ${created.id}`);
        createdCount++;
      } catch (error) {
        console.error(
          `  Error creating Subscription for "${sub.name}" (criteria: ${singleCriteria}):`,
          error
        );
      }
    }
  }

  console.log(`\nSubscription setup complete. Created: ${createdCount}, Skipped: ${skippedCount}.`);
}

main().catch(console.error);
