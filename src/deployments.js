const deploymentsArray = [
  // Main deployment that will grab everything
  // based on how the source is set up
  {
    name: 'realtime'
  },
  // AirNow clean up.
  {
    name: 'airnow',
    source: 'AirNow',
    offset: 24
  },
  // For some reason the london source works better when alone
  {
    name: 'london',
    source: 'London Air Quality Network'
  },
  // The eea provider has a lag and so we need to use the offset
  {
    name: 'eea',
    adapter: 'eea-direct',
    offset: 24
  },
  // one of ACUMAR's stations is always late
  {
    name: 'acumar',
    adapter: 'acumar',
    offset: 72
  },
  // Japan is slow and needs to be alone
  {
    name: 'japan',
    source: 'japan-soramame',
  },
  {
    name: 'mexico',
    source: 'Sinaica Mexico'
  }
];

export { deploymentsArray };
