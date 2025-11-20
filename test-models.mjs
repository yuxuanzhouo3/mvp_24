// Quick test to verify Mistral models are configured correctly
import { aiRouter } from './lib/ai/router.ts';

try {
  const router = aiRouter;
  console.log('✅ AIRouter initialized');

  const models = router.getAllModels();
  console.log('\n📋 Available models:');
  models.forEach(m => console.log(`  - ${m}`));

  console.log('\n🎯 Checking Mistral models:');
  const mistralModels = [
    'mistral-tiny',
    'mistral-large-latest',
    'magistral-small-latest',
    'magistral-medium-latest',
    'codestral-latest',
    'codestral-2412',
    'devstral-small-latest',
    'devstral-medium-latest',
  ];

  mistralModels.forEach(model => {
    const available = router.isModelAvailable(model);
    const status = available ? '✅' : '❌';
    console.log(`  ${status} ${model}`);
  });

} catch (error) {
  console.error('❌ Error:', error.message);
}
