module.exports = class Parser {

    static checkNumber(dados) {

        if(dados?.infos[1]?.replace(/\D/g, '').length > 9 && dados?.infos[1]?.replace(/\D/g, '').length < 15){
            return `${dados.infos[1].replace(/\D/g, '')}`;
        } else if(dados?.infos[2]?.replace(/\D/g, '').length > 9 && dados?.infos[2]?.replace(/\D/g, '').length < 15){
            return `${dados.infos[2].replace(/\D/g, '')}`;
        } else if(dados?.infos[3]?.replace(/\D/g, '').length > 9 && dados?.infos[3]?.replace(/\D/g, '').length < 15){
            return `${dados.infos[3].replace(/\D/g, '')}`;
        } else if(dados?.infos[4]?.replace(/\D/g, '').length > 9 && dados?.infos[4]?.replace(/\D/g, '').length < 15){
            return `${dados.infos[4].replace(/\D/g, '')}`;
        } else if (dados?.infos[5]?.replace(/\D/g, '').length > 9 && dados?.infos[5]?.replace(/\D/g, '').length < 15){
            return `${dados.infos[5].replace(/\D/g, '')}`;
        }
        return '';
    }
    
}