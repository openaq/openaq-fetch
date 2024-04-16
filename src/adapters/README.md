# Adapter writing guidelines
These are guidelines that should be followed whenever possible. If a specific one cannot be followed please document the reason in the code.

## Purpose
The purpose of the adapters is to fetch data from the source, parse it and transform it into our standard shape for a measurement. We should not be checking data in the adapters.

## Style guide
* Code should always be extremely readable
* Only nest functions as a last resort
* Declared variables should go at the top of the file

## Error handling
A lot of time is spent debugging errors so be kind to the next person when you are writing your code.
* Be thorough with error handling, catch and handle all possible points of error.
* Keep the amount of code in a try block to a mininum. Its not helpful if we dont know where the error originated.
* Do not use a try/catch block that covers an entire function internally, instead wrap the call to that function in a try/catch.
* Do not just rely on error catching for things we can check. Check data and throw custom errors if needed.
* Error messages should provide enough detail to at least see where the error occurred
* Think about what should happen if an error is found, should the adapter fail? Should it skip a measurement but keep running?
* Ideally all errors should end up in the `failure` object

## Documentation
What is said for errors can also be said for documentation, the nice developer documents their code for the person that will later fix it :)
* DocStrings on all functions with a brief description, the arguments and the reponse
* Inline comments where you are doing something outside the norm
* Whenever you add a new package to project (this should be documented in a commit, not always in the code)

## General Format
* Always includes an exported `fetchData` method
* Include a `fetchStations` that will return a list of stations
* A `formatData`

* Parameters mapping object on top, exported and used by script
