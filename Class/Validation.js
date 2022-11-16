module.exports = class Validation {

    static validate(data){
        if(!data.query){
            return false;
        }
        if(!data.webhook){
            return false;
        }
        if(!data.time){
            return false;
        }
        if(!data.hook){
            return false;
        }
        return true;
    }
    
}