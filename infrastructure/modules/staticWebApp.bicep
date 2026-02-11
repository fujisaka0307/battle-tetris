// =============================================================================
// Azure Static Web Apps - Free Tier
// =============================================================================

@description('Azure region for the Static Web App.')
param location string

@description('Resource name suffix.')
param name string

// -----------------------------------------------------------------------------
// Resources
// -----------------------------------------------------------------------------

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: 'stapp-${name}'
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
    buildProperties: {
      skipGithubActionWorkflowGeneration: true
    }
  }
}

// -----------------------------------------------------------------------------
// Outputs
// -----------------------------------------------------------------------------

@description('Default hostname of the Static Web App.')
output defaultHostname string = 'https://${staticWebApp.properties.defaultHostname}'

@description('Resource ID of the Static Web App.')
output resourceId string = staticWebApp.id
